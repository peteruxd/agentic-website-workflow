#!/usr/bin/env node
/**
 * Multi-Agent Web Design Orchestrator
 * ===================================
 * DAG-based workflow manager with review checkpoints and user feedback.
 *
 * WORKFLOW:
 *   Researcher -> [Review] -> PM -> [Review] -> Designer -> [Review] ->
 *   Content Writer -> [Review] -> Architect -> FE Engineer + BE Engineer -> QA
 *
 * USAGE:
 *   node orchestrator.js --status              # Show current state
 *   node orchestrator.js --reset               # Reset workflow
 *   node orchestrator.js --agent <id>          # Get agent context
 *   node orchestrator.js --complete <id>        # Mark agent complete
 *   node orchestrator.js --generate-htmls      # Generate HTML docs
 *   node orchestrator.js --review <stage>      # Review a stage's output
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

// —————————————————————————————————————
// Baked in by setup.js
// —————————————————————————————————————
const PROJECT_NAME = '{{ PROJECT_NAME }}';
const PRIMARY_COLOR = '{{ PRIMARY_COLOR }}';
// —————————————————————————————————————
// Helpers
// —————————————————————————————————————
function projectSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const BASE_DIR = __dirname;
const STATE_FILE = 'workflow_state.json';
const MAX_ATTEMPTS = 3;

const STAGES = {
  researcher: {
    id: 'researcher',
    name: 'Researcher',
    prompt_file: 'agents/prompts/01_researcher.md',
    output_file: 'Generated documents/01_research/market_analysis',
    output_name: 'Market Analysis',
    depends_on: [],
    is_code: false,
    description: 'Market research and UI/UX trends analysis',
  },
  pm: {
    id: 'pm',
    name: 'Product Manager',
    prompt_file: 'agents/prompts/02_pm.md',
    output_file: 'Generated documents/02_prd/product_requirements',
    output_name: 'Product Requirements',
    depends_on: ['researcher'],
    is_code: false,
    description: 'Product requirements and feature specifications',
  },
  designer: {
    id: 'designer',
    name: 'Designer',
    prompt_file: 'agents/prompts/04_designer.md',
    output_file: 'Generated documents/04_design/design_system',
    output_name: 'Design System',
    depends_on: ['pm'],
    is_code: false,
    description: 'Design system with 3-option evaluation',
  },
  content_writer: {
    id: 'content_writer',
    name: 'Content Writer',
    prompt_file: 'agents/prompts/08_content_writer.md',
    output_file: 'Generated documents/08_content/copy',
    output_name: 'Website Copy',
    depends_on: ['designer'],
    is_code: false,
    description: 'SEO-optimized content writing',
  },
  architect: {
    id: 'architect',
    name: 'Architect',
    prompt_file: 'agents/prompts/03_architect.md',
    output_file: 'Generated documents/03_architecture/system_design',
    output_name: 'System Design',
    depends_on: ['pm'],
    is_code: true,
    description: 'Technical architecture and file structure',
  },
  fe_engineer: {
    id: 'fe_engineer',
    name: 'FE Engineer',
    prompt_file: 'agents/prompts/05_fe_engineer.md',
    output_file: 'Generated documents/05_frontend/component_library',
    output_name: 'Frontend Components',
    depends_on: ['designer', 'architect', 'content_writer'],
    is_code: true,
    description: 'Frontend implementation',
  },
  be_engineer: {
    id: 'be_engineer',
    name: 'BE Engineer',
    prompt_file: 'agents/prompts/06_be_engineer.md',
    output_file: 'Generated documents/06_backend/api_implementation',
    output_name: 'Backend API',
    depends_on: ['architect'],
    is_code: true,
    description: 'Backend API implementation',
  },
  qa: {
    id: 'qa',
    name: 'QA Engineer',
    prompt_file: 'agents/prompts/07_qa.md',
    output_file: 'Generated documents/07_qa/qa_audit',
    output_name: 'QA Audit',
    depends_on: ['fe_engineer', 'be_engineer'],
    is_code: false,
    description: 'Quality assurance — functionality and usability',
  },
};

const REVIEW_STAGES = {
  research: {
    id: 'review_research',
    name: 'Review Research',
    depends_on: ['researcher'],
    html_file: 'Generated documents/01_research/market_analysis.html',
    md_file: 'Generated documents/01_research/market_analysis.md',
  },
  prd: {
    id: 'review_prd',
    name: 'Review PRD',
    depends_on: ['pm'],
    html_file: 'Generated documents/02_prd/product_requirements.html',
    md_file: 'Generated documents/02_prd/product_requirements.md',
  },
  design: {
    id: 'review_design',
    name: 'Review Design',
    depends_on: ['designer'],
    html_file: 'Generated documents/04_design/design_system.html',
    md_file: 'Generated documents/04_design/design_system.md',
  },
  content: {
    id: 'review_content',
    name: 'Review Content',
    depends_on: ['content_writer'],
    html_file: 'Generated documents/08_content/copy.html',
    md_file: 'Generated documents/08_content/copy.md',
  },
};

const WORKFLOW_ORDER = ['researcher', 'pm', 'designer', 'content_writer', 'architect', 'fe_engineer', 'be_engineer', 'qa'];

const FOLDERS = [
  '00_requirements',
  'Generated documents/01_research',
  'Generated documents/02_prd',
  'Generated documents/03_architecture',
  'Generated documents/04_design',
  'Generated documents/08_content',
  'Generated documents/05_frontend',
  'Generated documents/06_backend',
  'Generated documents/07_qa',
  'agents/prompts',
];

// —————————————————————————————————————
// Markdown → HTML Converter
// —————————————————————————————————————
function formatInlineCode(text) {
  return text.replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1.5 py-0.5 rounded text-sm">$1</code>');
}

function convertMarkdownToHtml(md) {
  const lines = md.split('\n');
  const parts = [];
  let inCode = false;
  let inList = false;
  let inTable = false;

  const tableHeaders = ['Category', 'Check', 'Status', 'Feature', 'Priority', 'Description', 'Section', 'Item', 'Name', 'Hex'];

  for (let line of lines) {
    line = line.trim();

    if (!line) {
      if (inList) { parts.push('</ul>'); inList = false; }
      if (inTable) { parts.push('</table></div>'); inTable = false; }
      continue;
    }

    if (line.startsWith('```')) {
      if (inCode) { parts.push('</code></pre>'); inCode = false; }
      else { parts.push('<pre class="bg-slate-800 p-4 rounded-lg overflow-x-auto mb-4"><code>'); inCode = true; }
      continue;
    }

    if (inCode) { parts.push(line); continue; }

    if (line.startsWith('# ')) {
      parts.push(`<h1 class="text-4xl font-bold mb-8">${line.slice(2)}</h1>`);
    } else if (line.startsWith('## ')) {
      parts.push(`<h2 class="text-2xl font-semibold mb-4 mt-8">${line.slice(3)}</h2>`);
    } else if (line.startsWith('### ')) {
      parts.push(`<h3 class="text-xl font-semibold mb-3 mt-6">${line.slice(4)}</h3>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { parts.push('<ul class="list-disc list-inside space-y-2 mb-4">'); inList = true; }
      parts.push(`<li class="text-slate-300">${formatInlineCode(line.slice(2))}</li>`);
    } else if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        parts.push('<div class="overflow-x-auto mb-4"><table class="w-full border-collapse">');
        inTable = true;
      }
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (line.includes('---')) continue;
      const isHeader = cells.some(c => tableHeaders.includes(c));
      const tag = isHeader ? 'th' : 'td';
      const row = cells.map(c => `<${tag} class="border border-slate-700 px-4 py-2 text-slate-300">${c}</${tag}>`).join('');
      parts.push(`<tr>${row}</tr>`);
    } else {
      let text = formatInlineCode(line);
      text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      parts.push(`<p class="text-slate-300 mb-4">${text}</p>`);
    }
  }

  if (inList) parts.push('</ul>');
  if (inTable) parts.push('</table></div>');

  return parts.join('\n');
}

// —————————————————————————————————————
// HTML Template
// —————————————————————————————————————
function htmlTemplate(title, contentHtml, navLinksHtml, footerTitle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — ${PROJECT_NAME}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
                    colors: { primary: '#0f172a', secondary: '#1e293b', accent: '${PRIMARY_COLOR}' }
                }
            }
        }
    </script>
    <style>
        body { font-family: 'Inter', sans-serif; }
        .prose { max-width: 80ch; }
        .prose pre { background: #1e293b; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
        .prose code { background: #1e293b; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; }
        .prose table { width: 100%; border-collapse: collapse; }
        .prose th { background: #1e293b; padding: 0.75rem; text-align: left; font-weight: 600; }
        .prose td { padding: 0.75rem; border-bottom: 1px solid #334155; }
        .prose tr:hover { background: #1e293b/50; }
    </style>
</head>
<body class="bg-slate-900 text-slate-200 min-h-screen">
    <header class="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div class="max-w-5xl mx-auto px-6 py-4">
            <div class="flex items-center justify-between">
                <a href="#" class="text-xl font-bold" style="color:${PRIMARY_COLOR}">${PROJECT_NAME}</a>
                <nav class="flex gap-6 text-sm">
                    ${navLinksHtml}
                </nav>
            </div>
        </div>
    </header>
    <main class="max-w-5xl mx-auto px-6 py-12">
        ${contentHtml}
    </main>
    <footer class="border-t border-slate-800 mt-12 py-8">
        <div class="max-w-5xl mx-auto px-6 text-center text-slate-500 text-sm">
            ${PROJECT_NAME} — ${footerTitle}
        </div>
    </footer>
</body>
</html>`;
}

// —————————————————————————————————————
// Navigation Links
// —————————————————————————————————————
const NAV_LINKS = {
  '01_research': [
    ['Research', 'market_analysis.html', true],
    ['PRD', '../02_prd/product_requirements.html', false],
    ['Design', '../04_design/design_system.html', false],
    ['Content', '../08_content/copy.html', false],
    ['Architecture', '../03_architecture/system_design.html', false],
  ],
  '02_prd': [
    ['Research', '../01_research/market_analysis.html', false],
    ['PRD', 'product_requirements.html', true],
    ['Design', '../04_design/design_system.html', false],
    ['Content', '../08_content/copy.html', false],
    ['Architecture', '../03_architecture/system_design.html', false],
  ],
  '04_design': [
    ['Research', '../01_research/market_analysis.html', false],
    ['PRD', '../02_prd/product_requirements.html', false],
    ['Design', 'design_system.html', true],
    ['Content', '../08_content/copy.html', false],
    ['Architecture', '../03_architecture/system_design.html', false],
  ],
  '08_content': [
    ['Research', '../01_research/market_analysis.html', false],
    ['PRD', '../02_prd/product_requirements.html', false],
    ['Design', '../04_design/design_system.html', false],
    ['Content', 'copy.html', true],
    ['Architecture', '../03_architecture/system_design.html', false],
  ],
  '03_architecture': [
    ['Research', '../01_research/market_analysis.html', false],
    ['PRD', '../02_prd/product_requirements.html', false],
    ['Design', '../04_design/design_system.html', false],
    ['Content', '../08_content/copy.html', false],
    ['Architecture', 'system_design.html', true],
  ],
};

function generateNavLinks(folder) {
  const links = NAV_LINKS[folder] || [];
  return links.map(([label, href, isActive]) =>
    isActive
      ? `<a href="${href}" class="text-blue-500 font-medium">${label}</a>`
      : `<a href="${href}" class="text-slate-400 hover:text-white transition">${label}</a>`
  ).join('\n                    ');
}

// —————————————————————————————————————
// Orchestrator
// —————————————————————————————————————
class Orchestrator {
  constructor() {
    this.ensureDirs();
    this.state = this.loadState();
  }

  ensureDirs() {
    for (const folder of FOLDERS) {
      fs.mkdirSync(path.join(BASE_DIR, folder), { recursive: true });
    }
  }

  loadState() {
    const statePath = path.join(BASE_DIR, STATE_FILE);
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    }
    return {
      current_stage: null, completed_stages: [], qa_attempts: 0,
      failing_items: [], iteration_history: [], pending_agent: null,
      last_review: null, feedback: {},
    };
  }

  saveState() {
    fs.writeFileSync(path.join(BASE_DIR, STATE_FILE), JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
  }

  readFile(filePath) {
    const fullPath = path.join(BASE_DIR, filePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
    return `[File not found: ${filePath}]`;
  }

  writeFile(filePath, content) {
    fs.writeFileSync(path.join(BASE_DIR, filePath), content, 'utf-8');
  }

  getCurrentAgent() {
    for (const stageId of WORKFLOW_ORDER) {
      if (!this.state.completed_stages.includes(stageId)) {
        const depsMet = STAGES[stageId].depends_on.every(d => this.state.completed_stages.includes(d));
        if (depsMet) return stageId;
      }
    }
    return null;
  }

  getAgentContext(stageId) {
    const stage = STAGES[stageId];
    const requirements = this.readFile('00_requirements/requirements.md');

    const contextParts = [];
    for (const dep of stage.depends_on) {
      const depStage = STAGES[dep];
      contextParts.push(`\n${'='.repeat(60)}\n${depStage.name} Output\n${'='.repeat(60)}\n`);
      contextParts.push(this.readFile(`${depStage.output_file}.md`));
    }

    const feedback = this.state.feedback[stageId]
      ? `\n\n${'='.repeat(60)}\nUSER FEEDBACK (to address):\n${'='.repeat(60)}\n${this.state.feedback[stageId]}`
      : '';

    return {
      stage_id: stageId,
      stage,
      requirements,
      context: contextParts.join('\n'),
      prompt: this.readFile(stage.prompt_file),
      feedback,
    };
  }

  markCompleted(stageId) {
    if (!this.state.completed_stages.includes(stageId)) {
      this.state.completed_stages.push(stageId);
    }
    this.state.current_stage = stageId;
    this.saveState();
  }

  showStatus() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('WORKFLOW STATUS');
    console.log(`${'='.repeat(60)}`);
    console.log(`QA Attempts: ${this.state.qa_attempts}/${MAX_ATTEMPTS}`);
    console.log(`\nCompleted stages:`);
    for (const stageId of WORKFLOW_ORDER) {
      const stage = STAGES[stageId];
      const status = this.state.completed_stages.includes(stageId) ? '[OK]' : '[ ]';
      console.log(`  ${status} ${stage.name}`);
    }

    const next = this.getCurrentAgent();
    if (next) console.log(`\nNext agent to run: ${STAGES[next].name}`);
    if (this.state.last_review) console.log(`\nLast review: ${this.state.last_review}`);
    if (this.state.failing_items.length) console.log(`\nFailing items: ${this.state.failing_items.length}`);
  }

  reset() {
    this.state = {
      current_stage: null, completed_stages: [], qa_attempts: 0,
      failing_items: [], iteration_history: [], pending_agent: null,
      last_review: null, feedback: {},
    };
    this.saveState();
    console.log('[OK] Workflow state reset');
  }

  convertMdToHtml(mdPath, htmlPath, title, folder) {
    const mdContent = this.readFile(mdPath);
    const htmlContent = convertMarkdownToHtml(mdContent);
    const nav = generateNavLinks(folder);
    const html = htmlTemplate(title, htmlContent, nav, title);
    this.writeFile(htmlPath, html);
    console.log(`  Generated: ${htmlPath}`);
  }

  generateHtmls() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('GENERATING HTML DOCUMENTS');
    console.log(`${'='.repeat(60)}`);

    const map = [
      ['Generated documents/01_research/market_analysis.md', 'Generated documents/01_research/market_analysis.html', 'Market Analysis', '01_research'],
      ['Generated documents/02_prd/product_requirements.md', 'Generated documents/02_prd/product_requirements.html', 'Product Requirements', '02_prd'],
      ['Generated documents/04_design/design_system.md', 'Generated documents/04_design/design_system.html', 'Design System', '04_design'],
      ['Generated documents/08_content/copy.md', 'Generated documents/08_content/copy.html', 'Website Copy', '08_content'],
      ['Generated documents/03_architecture/system_design.md', 'Generated documents/03_architecture/system_design.html', 'System Architecture', '03_architecture'],
      ['Generated documents/07_qa/qa_audit.md', 'Generated documents/07_qa/qa_audit.html', 'QA Audit', '07_qa'],
    ];

    for (const [mdPath, htmlPath, title, folder] of map) {
      const fullMd = path.join(BASE_DIR, mdPath);
      if (fs.existsSync(fullMd)) {
        try { this.convertMdToHtml(mdPath, htmlPath, title, folder); }
        catch (e) { console.log(`  Error: ${htmlPath} — ${e.message}`); }
      } else {
        console.log(`  Skipping ${mdPath} (not found)`);
      }
    }

    console.log('\n[OK] HTML generation complete');
  }

  reviewStage(stageName) {
    const review = REVIEW_STAGES[stageName];
    if (!review) {
      console.log(`Unknown review stage: ${stageName}`);
      console.log(`Available: ${Object.keys(REVIEW_STAGES).join(', ')}`);
      return;
    }

    const htmlPath = path.join(BASE_DIR, review.html_file);
    if (!fs.existsSync(htmlPath)) {
      console.log(`HTML file not found: ${htmlPath}`);
      console.log('Run --generate-htmls first after generating the document.');
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`REVIEW: ${review.name}`);
    console.log(`${'='.repeat(60)}`);

    const url = `file://${htmlPath}`;
    console.log(`Opening: ${url}`);

    // Cross-platform browser open
    const browserCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(browserCmd, [url], { shell: true, detached: true, stdio: 'ignore' });

    console.log('\nReview the document in your browser.');
    console.log('Commands:');
    console.log("  - 'approve' : Approve and continue to next stage");
    console.log("  - 'feedback <text>' : Provide feedback to regenerate");
    console.log("  - 'quit' : Exit without changes\n");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const prompt = () => {
      rl.question('Enter command: ', (input) => {
        const cmd = input.trim();

        if (cmd.toLowerCase() === 'quit') {
          console.log('Exiting review.');
          rl.close();
          return;
        }

        if (cmd.toLowerCase() === 'approve') {
          const stageId = review.depends_on[0];
          this.markCompleted(stageId);
          this.state.last_review = null;
          delete this.state.feedback[stageId];
          this.saveState();
          console.log(`\n[OK] ${STAGES[stageId].name} approved!`);
          console.log(`Next: ${this.getCurrentAgent() || 'All done'}`);
          rl.close();
          return;
        }

        if (cmd.toLowerCase().startsWith('feedback ')) {
          const text = cmd.slice(9).trim();
          if (!text) {
            console.log('Please provide feedback text after "feedback"');
            prompt();
            return;
          }
          const stageId = review.depends_on[0];
          this.state.last_review = stageName;
          this.state.feedback[stageId] = text;
          this.saveState();
          console.log(`\n[OK] Feedback saved for ${STAGES[stageId].name}`);
          console.log(`Re-run the agent with: node orchestrator.js --agent ${stageId}`);
          rl.close();
          return;
        }

        console.log("Unknown command. Use 'approve', 'feedback <text>', or 'quit'");
        prompt();
      });
    };

    prompt();
  }
}

// —————————————————————————————————————
// CLI
// —————————————————————————————————————
function main() {
  const orchestrator = new Orchestrator();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    orchestrator.showStatus();
    return;
  }

  switch (args[0]) {
    case '--status':
      orchestrator.showStatus();
      break;

    case '--reset':
      orchestrator.reset();
      break;

    case '--generate-htmls':
      orchestrator.generateHtmls();
      break;

    case '--review':
      if (args[1]) orchestrator.reviewStage(args[1]);
      else console.log('Usage: node orchestrator.js --review <research|prd|design|content>');
      break;

    case '--agent':
      if (args[1]) {
        const ctx = orchestrator.getAgentContext(args[1]);
        console.log(`\n=== CONTEXT FOR ${ctx.stage.name} ===`);
        console.log(`\nRequirements:\n${ctx.requirements}`);
        console.log(`\nContext from dependencies:\n${ctx.context}`);
        if (ctx.feedback) console.log(`\n${ctx.feedback}`);
        console.log(`\nAgent Prompt:\n${ctx.prompt}`);
      } else {
        console.log('Usage: node orchestrator.js --agent <researcher|pm|designer|content_writer|architect|fe_engineer|be_engineer|qa>');
      }
      break;

    case '--complete':
      if (args[1]) {
        orchestrator.markCompleted(args[1]);
        console.log(`[OK] Marked ${args[1]} as completed`);
      } else {
        console.log('Usage: node orchestrator.js --complete <agent_id>');
      }
      break;

    default:
      console.log('Usage:');
      console.log('  node orchestrator.js --status');
      console.log('  node orchestrator.js --reset');
      console.log('  node orchestrator.js --generate-htmls');
      console.log('  node orchestrator.js --review <research|prd|design|content>');
      console.log('  node orchestrator.js --agent <agent_id>');
      console.log('  node orchestrator.js --complete <agent_id>');
  }
}

main();

#!/usr/bin/env node
/**
 * Agentic Website Workflow — Project Scaffolder
 * Usage: node setup.js --name "My Project" [--color "#112AD0"] [--output ./my-project]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

function parseArgs() {
  const opts = { name: null, color: '#112AD0', output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) { opts.name = args[++i]; }
    else if (args[i] === '--color' && args[i + 1]) { opts.color = args[++i]; }
    else if (args[i] === '--output' && args[i + 1]) { opts.output = args[++i]; }
  }
  if (!opts.name) {
    console.error('Error: --name is required');
    console.log('Usage: node setup.js --name "My Project" [--color "#112AD0"] [--output ./my-project]');
    process.exit(1);
  }
  opts.slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return opts;
}

function copyTemplate(templateDir, outputDir, replacements) {
  const entries = fs.readdirSync(templateDir, { withFileTypes: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(templateDir, entry.name);
    const destPath = path.join(outputDir, entry.name);

    if (entry.name === 'Generated documents') continue;

    if (entry.isDirectory()) {
      copyTemplate(srcPath, destPath, replacements);
    } else {
      let content = fs.readFileSync(srcPath, 'utf-8');
      for (const [key, val] of Object.entries(replacements)) {
        content = content.split(`{{ ${key} }}`).join(val);
        content = content.split(`{{${key}}}`).join(val);
      }
      fs.writeFileSync(destPath, content, 'utf-8');
      console.log(`  Created: ${path.relative(outputDir, destPath)}`);
    }
  }
}

function createGeneratedDirs(baseDir) {
  const dirs = ['01_research', '02_prd', '03_architecture', '04_design', '05_frontend', '06_backend', '07_qa', '08_content', '09_art_director'];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(baseDir, 'Generated documents', dir), { recursive: true });
  }
  console.log('  Created: Generated documents/ (01-09)');
}

function writeStateFile(outputDir) {
  const state = {
    current_stage: null, completed_stages: [], qa_attempts: 0,
    failing_items: [], iteration_history: [], pending_agent: null,
    last_review: null, feedback: {}
  };
  fs.writeFileSync(path.join(outputDir, 'workflow_state.json'), JSON.stringify(state, null, 2) + '\n', 'utf-8');
  console.log('  Created: workflow_state.json');
}

function writeAgentsMd(outputDir, projectName) {
  fs.writeFileSync(path.join(outputDir, 'AGENTS.md'), `# ${projectName} — Agentic Workflow

Multi-agent DAG workflow for designing and building websites.

## Commands
| Command | Description |
|---------|-------------|
| \`node orchestrator.js --status\` | Show workflow state |
| \`node orchestrator.js --reset\` | Reset workflow |
| \`node orchestrator.js --agent <id>\` | Get agent context |
| \`node orchestrator.js --complete <id>\` | Mark agent complete |
| \`node orchestrator.js --generate-htmls\` | Generate HTML docs |
| \`node orchestrator.js --review <stage>\` | Review stage output |

## Agents
| Agent | Description |
|-------|-------------|
| researcher | Market research and UI/UX trends |
| pm | Product requirements and feature specs |
| designer | Design system (3-option evaluation) |
| content_writer | SEO-optimized website copy |
| architect | Technical architecture |
| art_director | Image and graphic asset generation |
| fe_engineer | Frontend implementation |
| be_engineer | Backend API implementation |
| qa | Functionality and usability validation |

## Workflow
\`\`\`
Researcher -> [Review] -> PM -> [Review] -> Designer -> [Review] ->
Content Writer -> [Review] -> Architect -> Art Director -> [Review] ->
FE Engineer + BE Engineer -> QA
\`\`\`

## Review Stages
- \`research\` — Review market analysis
- \`prd\` — Review product requirements
- \`design\` — Review design system
- \`content\` — Review website copy
- \`imagery\` — Review image assets

Commands during review: \`approve\`, \`feedback <text>\`, \`quit\`
`, 'utf-8');
  console.log('  Created: AGENTS.md');
}

function main() {
  const opts = parseArgs();
  const templateDir = path.join(__dirname, 'template');
  const outputDir = opts.output ? path.resolve(opts.output) : path.join(process.cwd(), opts.slug);

  if (!fs.existsSync(templateDir)) {
    console.error(`Error: Template directory not found at ${templateDir}`);
    process.exit(1);
  }
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) {
    console.error(`Error: Output directory "${outputDir}" already exists and is not empty.`);
    process.exit(1);
  }

  const replacements = {
    'PROJECT_NAME': opts.name,
    'PROJECT_SLUG': opts.slug,
    'PRIMARY_COLOR': opts.color,
    'YEAR': String(new Date().getFullYear()),
  };

  console.log(`\nScaffolding: ${opts.name}`);
  console.log(`  Output: ${outputDir}`);
  console.log(`  Color: ${opts.color}\n`);

  copyTemplate(templateDir, outputDir, replacements);
  createGeneratedDirs(outputDir);
  writeStateFile(outputDir);
  writeAgentsMd(outputDir, opts.name);

  console.log(`\n[OK] Project "${opts.name}" scaffolded at ${outputDir}`);
  console.log('\nNext steps:');
  console.log(`  cd ${path.relative(process.cwd(), outputDir)}`);
  console.log('  Edit 00_requirements/requirements.md');
  console.log('  node orchestrator.js --agent researcher');
  console.log('  (Save output → --complete → --generate-htmls → --review)');
}

main();

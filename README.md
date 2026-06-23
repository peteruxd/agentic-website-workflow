# Agentic Website Workflow

A **multi-agent DAG workflow** for designing and building websites, powered by autonomous AI agents working in sequence with human review checkpoints.

```
Researcher → [Review] → PM → [Review] → Designer → [Review] →
Content Writer → [Review] → Architect → FE Engineer + BE Engineer → QA
```

Each agent receives the upstream outputs as context and follows a structured prompt to produce a deliverable. You review and approve at each checkpoint before the next agent runs.

## Quick Start

```bash
# 1. Clone this repo (once, reuse for every project)
git clone https://github.com/you/agentic-website-workflow.git

# 2. Scaffold a new project
node agentic-website-workflow/setup.js \
    --name "My Project" \
    --color "#112AD0" \
    --output ./my-project

# 3. Enter the project directory
cd my-project

# 4. Edit your requirements
# (open 00_requirements/requirements.md)

# 5. Run the first agent
node orchestrator.js --agent researcher
```

## Setup Options

| Flag | Description | Default |
|------|-------------|---------|
| `--name` | Project name (required) | — |
| `--color` | Accent color for generated HTML docs | `#112AD0` |
| `--output` | Output directory | `./<project-slug>` |

## Workflow Steps

Run each agent in order, saving its output before moving to the next:

```
node orchestrator.js --agent researcher
# → Save output to Generated documents/01_research/market_analysis.md
# → node orchestrator.js --complete researcher
# → node orchestrator.js --generate-htmls
# → node orchestrator.js --review research
```

Repeat for each agent. The `--agent` command prints three sections:
1. **Requirements** — from `00_requirements/requirements.md`
2. **Context from dependencies** — upstream agent outputs
3. **Agent Prompt** — the instructions for this agent

## Commands

| Command | Description |
|---------|-------------|
| `--status` | Show current workflow state and next agent |
| `--reset` | Reset all progress |
| `--agent <id>` | Get context and prompt for an agent |
| `--complete <id>` | Mark an agent as done |
| `--generate-htmls` | Convert all markdown to styled HTML |
| `--review <stage>` | Open HTML in browser for approval/feedback |

### Agent IDs

`researcher`, `pm`, `designer`, `content_writer`, `architect`, `fe_engineer`, `be_engineer`, `qa`

### Review Stages

`research`, `prd`, `design`, `content`

During review:
- `approve` — Approve and continue
- `feedback <text>` — Reject with notes for the agent to address
- `quit` — Exit without changes

## Agents

| Agent | Reads From | Output |
|-------|-----------|--------|
| **Researcher** | Requirements | Market analysis, 3 design directions, tech stack |
| **PM** | Requirements, Research | PRD with personas, features, acceptance criteria |
| **Designer** | Requirements, Research, Architecture | Design system (3 options → selection) |
| **Content Writer** | Requirements, Design, Research | SEO-optimized website copy |
| **Architect** | Requirements, PRD | Tech stack, file structure, API design |
| **FE Engineer** | Architecture, Design, Content | Frontend components and pages |
| **BE Engineer** | Architecture, PRD | API routes, validation, error handling |
| **QA** | Requirements, Design, FE, BE | Functionality + usability audit |

## Project Structure

```
my-project/
├── 00_requirements/
│   └── requirements.md         # ← Edit this first
├── Generated documents/
│   ├── 01_research/            # Market analysis
│   ├── 02_prd/                 # Product requirements
│   ├── 03_architecture/        # Technical architecture
│   ├── 04_design/              # Design system
│   ├── 05_frontend/            # Frontend code
│   ├── 06_backend/             # Backend code
│   ├── 07_qa/                  # QA audit
│   └── 08_content/             # Website copy
├── agents/prompts/             # Agent instructions (customize per project)
├── orchestrator.js             # Workflow runner
├── workflow_state.json         # Tracks progress
└── AGENTS.md                   # OpenCode integration
```

## Customizing Prompts

Each agent prompt is a markdown file in `agents/prompts/`. Edit them to:
- Add project-specific context
- Adjust output requirements
- Change evaluation criteria
- Add or remove sections

## How It Works

The orchestrator is a **directed acyclic graph (DAG)** workflow manager:

1. Each agent has dependencies defined in `orchestrator.js`
2. `--agent` prints the agent's instructions plus all upstream outputs as context
3. You run the agent (copy the context into your AI tool of choice)
4. Save the output as markdown in the appropriate `Generated documents/` folder
5. `--complete` marks the stage done and unlocks dependent agents
6. `--generate-htmls` converts all markdown to styled HTML documentation
7. `--review` opens the HTML in your browser for interactive review

## Requirements

- **Node.js 18+** (no other dependencies needed — the markdown-to-HTML converter is built in)

## License

MIT

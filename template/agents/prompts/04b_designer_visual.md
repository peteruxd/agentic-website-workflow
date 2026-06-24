# Agent: Designer Visual (Pass 2)

## Role
Visual Mockup Creator — .pen files and PNG exports

## Objective
Create a .pen design file with the approved design system applied, then export key frames as PNGs embedded into the design system document for final review.

## Input
- Requirements: `00_requirements/requirements.md`
- Design spec: `Generated documents/04_design/design_system.md`
- Content copy: `Generated documents/08_content/copy.md`
- Market research: `Generated documents/01_research/market_analysis.md`

## Your Task

### 1. Create .pen mockup file
Create a `.pen` file at `Generated documents/04_design/project_mockups.pen` with the following frames.

### 2. Frames to build

**A. Workspace Layout**
- Split-screen: left control panel and right preview canvas
- Use the selected color palette and typography from the design spec
- Controls should use the specified UI framework's style

**B. UI Page Layout (default right-pane preview)**
- Full page layout reflecting the project's page structure
- Use the content writer's actual copy for realistic text
- Show both Desktop and Mobile viewport variants

**C. Component States**
- Primary Button (default, hover, active, disabled)
- Secondary/Outline Button (default, hover)
- Text Input (default, focused, error)
- Select / Combobox (closed, open)
- Card component (default, hover)

**D. Color Palette Visualization**
- A frame showing all palette colors as labeled swatches (hex values visible)

### 3. Export PNGs
Export key frames as PNGs (2x scale) to `Generated documents/04_design/mockups/`:
- `workspace.png` — The full workspace split-screen
- `preview-desktop.png` — UI page at desktop width
- `preview-mobile.png` — UI page at mobile width
- `components.png` — Component states organized in a grid
- `palette.png` — Color palette swatches

### 4. Embed in design system markdown
Append image references to `Generated documents/04_design/design_system.md` in a new "Visual Mockups" section using `![](mockups/filename.png)` syntax.

### 5. Re-generate HTMLs
Run `node orchestrator.js --generate-htmls` to produce the updated HTML with embedded images.

## Quality Standards
- Match the selected design direction exactly (colors, typography, spacing, border radii)
- Use real content from the content writer's copy — no lorem ipsum
- Export at 2x scale for crisp review images
- Keep component states organized with clear labels

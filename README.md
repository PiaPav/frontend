# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Project Demos

This project includes several architecture visualization demos:

### Architecture Demo (New!)
**URL:** `/projects/demo-1/architecture`

An improved architecture visualization that:
- ✅ Shows Requirements with proper contrast (dark text on light background)
- ✅ Displays API Endpoints grouped by service
- ✅ Shows Legend with clear service color coding
- ✅ Excludes Health checks from visualization
- ✅ Left-to-right layout inspired by Graphviz
- ✅ Clean, professional design with gradients

**Features:**
- Requirements sidebar with all project dependencies
- Interactive graph with service nodes and connections
- Color-coded services (Account, Project, Database, Core)
- API endpoints panel showing HTTP methods and paths
- Node details on click
- Smooth streaming animation

### Other Demos
- **Demo 1:** `/projects/demo-1` - E-Commerce Platform visualization
- **Demo 2:** `/projects/demo-1/v2` - With file tree structure
- **Demo 3:** `/projects/demo-1/detailed` - Detailed view
- **Stream Demo:** `/projects/demo-1/stream` - Original streaming visualization

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

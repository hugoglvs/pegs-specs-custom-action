# PEGS Specs Generator Action

Generates professional PDF and HTML documentation from a requirements CSV using the **PEGS** (Project, Environment, Goals, System) architecture.

## 🚀 Features

- **Automated Documentation**: Generates a consolidated PDF and a tabbed HTML index.
- **PEGS Architecture**: Built-in support for the standard requirements engineering books.
- **Conditional Inclusion**: Automatically skips empty chapters and books that have no matching requirements in the CSV.
- **Diagram Support**: Render PlantUML diagrams and images directly into the documentation.
- **Robust Matching**: High-tolerance chapter title matching (case-insensitive and whitespace tolerant).

## 🛠️ Inputs

| Input | Description | Default | Required |
| --- | --- | --- | --- |
| `requirements-path` | Path to the requirements CSV file. | `requirements.csv` | Yes |
| `output-dir` | Directory where the artifacts will be generated. | `dist` | No |
| `templates-path` | Path to the directory containing `.adoc` templates for each book. | `templates` | No |

## 📊 CSV Schema

The requirements CSV must follow this structure:

| Column | Description |
| --- | --- |
| `id` | Unique requirement identifier (e.g., `G.1`, `REQ-1`). |
| `book` | The PEGS book name (e.g., `Goals Book`, `System Book`). |
| `chapter` | The chapter title within the book where the requirement belongs. |
| `description` | The full requirement text. |
| `reference to` | (Optional) Comma-separated list of IDs this requirement references. |
| `attached files` | (Optional) Semicolon-separated file paths (e.g., `assets/diagram.puml`). |

## 🏗️ PEGS Architecture

By default, the generator expects templates for:
1. **Project Book**: Constraints and expectations about the project process.
2. **Environment Book**: Application domain and external context.
3. **Goals Book**: High-level needs of the stakeholders.
4. **System Book**: Specifications of the requested system.

## 📝 Usage Example

Add the following to your `.github/workflows/main.yml`:

```yaml
steps:
  - name: Checkout Repository
    uses: actions/checkout@v4

  - name: Generate PEGS Documentation
    uses: ./ # Use the action in the current repo
    with:
      requirements-path: "requirements.csv"
      output-dir: "docs/build"

  - name: Upload Documentation
    uses: actions/upload-artifact@v4
    with:
      name: pegs-specs
      path: docs/build
```

## 📄 License

MIT

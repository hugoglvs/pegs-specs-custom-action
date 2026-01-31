# PEGS Specs Custom Action

A GitHub Action to generate professional Project specifications (requirements) documents using the **PEGS** framework (Project, Environment, Goals, System). It converts a CSV of requirements into a fully formatted, multi-book PDF document using AsciiDoc and PlantUML.

## Features

-   **PEGS Framework**: Automatically organizes requirements into Project, Environment, Goals, and System parts based on your structure configuration.
-   **Professional PDF Output**: Generates a consolidated PDF with a customizable cover page (Project Name, Authors, Logo, Date).
-   **Automated Changelog**: Generates an appendix from git tags.
-   **Standardized Numbering**: Enforces strict numbering (P.1.x, E.2.x, etc.) aligned with the document structure.
-   **Hierarchy Support**: Supports nested requirements (e.g., `S.1.2.1` is a child of `S.1.2`) with automatic recursive rendering.
-   **Strict Validation**: Validates ID formats, parent-child consistency, and ensures that "Required" sections are not empty.
-   **Visual Assets**: Integrated PlantUML support and image handling with automatic figure numbering and custom captions.

## Inputs

| Input | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `requirements-path` | Path to the source CSV file. | **Yes** | `requirements.csv` |
| `output-dir` | Directory where the PDF artifact will be generated. | No | `dist` |
| `structure-path` | Path to the structure definition CSV. | No | `structure.csv` |
| `templates-path` | Path to directory for .adoc overrides (advanced). | No | `templates` |
| `project-name` | Title of the project for the cover page. | No | Repo name |
| `authors` | Comma-separated list of authors. | No | Repo owner |
| `logo-path` | Path to a logo image for the title page. | No | None |
| `pdf-theme-path` | Path to a custom YAML theme file for PDF styling. | No | None |
| `pdf-fonts-dir` | Path to a directory containing custom fonts. | No | None |

## Structure Configuration (`structure.csv`)
This file defines the hierarchy of parts and sections. It must contain the following columns:
- `id`: Unique identifier (e.g., `G` for Part, `G.1` for Section).
- `type`: Type of the node (`Part` or `Section`).
- `title`: Title of the part or section.
- `description`: Brief description.
- `required`: (Optional) Boolean (`true`/`false`). If `true`, the validator will fail if no requirements are found for this section/part. Defaults to `false`.

### Example
```csv
id,type,title,description,required
G,Part,Goals Book,"Goals are needs...",false
G.1,Section,Context,"High-level view...",true
```

## CSV Schema

The action expects a CSV file with the following columns:

| Column | Description | Example |
| :--- | :--- | :--- |
| `id` | Unique identifier. **Must** follow `<Letter>.<Section>.<ID>` format. | `S.1.1` |
| `description` | The requirement text. | `The system shall...` |
| `priority` | MoSCoW priority (Must, Should, Could, Won't). | `Must` |
| `parent` | (Optional) The ID of the parent requirement. | `S.1.1` |
| `reference to` | (Optional) References to other requirement IDs. | `G.1.2` |
| `attached files` | (Optional) Semicolon-separated paths or `path\|caption` pairs. | `assets/diag.puml\|Architecture; assets/img.png` |

## Validation Rules

The action enforces strict validation. The build will fail if:
1.  **ID Format**: IDs must look like `X.Y.Z...` (Letter dot Number dot Number...).
2.  **Part Consistency**: The ID letter must match the Part defined in `structure.csv`.
3.  **Required Sections**: Any section marked `required=true` and its parent part must contain at least one requirement.
4.  **Relationship Consistency**: A child ID must start with its parent's exact ID.
5.  **Parent Existence**: If a `parent` is specified, it must appear as an `id` in the requirements.
6.  **Attached Files**: Any file path specified must exist in the repository.

> [!TIP]
> **Attached Files Tip**: Use `;` to separate multiple files and `|` to provide a custom caption. 
> Example: `assets/diagram.puml|System Architecture; assets/screenshot.png|Preview UI`

## Development

### Build
```bash
npm run all
```

### Test
```bash
npm test
```
The project uses `jest` for testing. The validator tests (`test/validator.test.ts`) mock the file system and CSV data to ensure robust validation logic.

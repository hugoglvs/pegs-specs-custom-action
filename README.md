# PEGS Specs Custom Action

A GitHub Action to generate professional Project specifications (requirements) documents using the **PEGS** framework (Project, Environment, Goals, System). It converts a CSV of requirements into fully formatted PDF and HTML documentation using AsciiDoc and PlantUML.

## Features

-   **PEGS Framework**: Automatically organizes requirements into Project, Environment, Goals, and System books.
-   **Standardized Numbering**: Enforces strict chapter numbering (P.1-7, E.1-6, G.1-7, S.1-6).
-   **Hierarchy Support**: Supports nested requirements (e.g., `S.1.2.1` is a child of `S.1.2`) with automatic recursive rendering.
-   **Strict Validation**: Validates ID formats, parent-child consistency, and proper book/chapter alignment before generation.
-   **Empty Chapter Handling**: Automatically inserts placeholders for chapters with no requirements.
-   **Diagram Support**: Integrated PlantUML support for generating diagrams referenced in requirements.

## Inputs

| Input | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `requirements-path` | Path to the source CSV file. | **Yes** | `requirements.csv` |
| `output-dir` | Directory where PDF/HTML artifacts will be generated. | No | `dist` |
| `structure-path` | Path to the structure definition CSV. | No | `structure.csv` |
| `templates-path` | Path to the directory containing `.adoc` templates for each book. | No | `templates` |

## Structure Configuration (`structure.csv`)
This file defines the hierarchy of books and chapters. It must contain the following columns:
- `id`: Unique identifier (e.g., `G` for Book, `G.1` for Chapter).
- `title`: Title of the book or chapter.
- `description`: Brief description.
- `required`: (Optional) Boolean (`true`/`false`). If `true`, the validator will fail if no requirements are found for this chapter/book. Defaults to `false`.

### Example
```csv
id,title,description,required
G,Goals Book,"Goals are needs...",false
G.1,Context,"High-level view...",true
```

## CSV Schema

The action expects a CSV file with the following columns:

| Column | Description | Example |
| :--- | :--- | :--- |
| `id` | Unique identifier. **Must** follow `<Letter>.<Chapter>.<ID>` format. | `S.1.1` |
| `book` | One of: `Project Book`, `Environment Book`, `Goals Book`, `System Book`. | `System Book` |
| `chapter` | The chapter title (must match the template). | `Components` |
| `description` | The requirement text. | `The system shall...` |
| `priority` | MoSCoW priority (Must, Should, Could, Won't). | `Must` |
| `parent` | (Optional) The ID of the parent requirement. | `S.1` |
| `reference to` | (Optional) References to other requirement IDs. | `G.1` |
| `attached files` | (Optional) Path to an image or PlantUML file. | `assets/diagram.puml` |

## Validation Rules

The action enforces strict validation. The build will fail if:
1.  **ID Format**: IDs must look like `X.Y.Z...` (Letter dot Number dot Number...).
2.  **Book Consistency**: The ID letter must match the Book (`P` for Project, `E` for Environment, etc.).
3.  **Chapter Consistency**: The ID chapter number must match the actual chapter index (e.g., `Components` is chapter 1 of System Book, so IDs must start with `S.1`).
4.  **Relationship Consistency**: A child ID must start with its parent's exact ID.
5.  **Parent Existence**: If a `parent` is specified, it must appear as an `id` in the requirement list. You cannot use Chapter IDs (e.g., `S.2`) as parents; top-level requirements must have an empty parent field.
6.  **Attached Files**: Any file path specified in `attached files` must exist in the repository.

> [!WARNING]
> While supported, requirements nested deeper than **6 levels** will trigger a build warning.

## Development

### Build
```bash
npm run all
```

### Test
```bash
npm test
```
The project uses `jest` for testing. The validator tests (`test/validator.test.ts`) mock the file system to ensure robust validation logic without external dependencies.

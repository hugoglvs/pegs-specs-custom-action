title: "Bug: Not all books are generated in PEGS Specs Action"
labels: ["bug"]
assignees: ["hugoglvs"]
body: |
  ### Description
  When using the action, some books (Parts) or sections are missing from the generated documentation.
  
  ### Root Causes Identified
  1. **Strict Type Matching**: The `type` column in `structure.csv` was case-sensitive and lacked default logic.
  2. **Flat Hierarchy**: The parser assumed all sections were direct children of the Part, preventing nested sections.
  3. **Non-Recursive Rendering**: The generator did not recursively render sub-sections.
  4. **ID Prefix Restriction**: IDs were hardcoded to `[GEPS]`, failing for any other custom part letters.
  5. **Single Output File**: The action only produced a consolidated PDF, whereas users might expect individual book PDFs.

  ### Fixes Applied
  - Made `type` check case-insensitive with intelligent defaulting.
  - Implemented recursive section rendering.
  - Improved ID-to-Section matching to support nested sections.
  - Allowed generic ID prefixes (`[A-Z]+`).
  - Added generation of individual PDFs for each Part defined in the structure.

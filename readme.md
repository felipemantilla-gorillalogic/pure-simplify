# Test Simplification Script

This script is designed to simplify and streamline test files in a project by leveraging the Claude AI model. It searches for spec files, analyzes them, and generates simplified versions while maintaining their effectiveness.

## Features

- Recursively searches for spec files (`.spec.js`, `.spec.ts`, `.spec.vue`) in a given directory
- Identifies related files for each spec file
- Sends spec file content to Claude AI for analysis and simplification
- Generates a simplified version of each spec file
- Provides a progress bar during processing
- Creates a summary report of processed files

## Prerequisites

- Node.js
- NPM packages: `fs`, `path`, `axios`, `chalk`, `readline`
- Claude API key (set as an environment variable `CLAUDE_API_KEY`)

## Usage

1. Run the script:
   ```
   node script_name.js
   ```

2. Enter the directory path when prompted.

3. The script will process the spec files and display a progress bar.

4. After completion, a summary of processed files will be shown.

5. A JSON report will be generated in the specified directory.

## Functions

### `findSpecFilesAndRelated(dir, filesList = [])`

Recursively searches for spec files and their related files in the given directory.

### `sendToClaudeForReview(specContent, relatedContent)`

Sends the spec file content to Claude AI for analysis and simplification.

### `updateProgressBar(current, total)`

Updates and displays the progress bar during file processing.

### `main()`

The main function that orchestrates the entire process.

## Error Handling

- The script includes error handling for file reading, API calls, and JSON parsing.
- It implements a retry mechanism for failed API calls.

## Limitations

- For testing purposes, the script currently processes only the first 6 files.
- The Claude API has a token limit, which may affect the processing of very large spec files.

## Output

- Simplified spec files (overwriting the original files)
- A JSON report containing information about processed files and any errors encountered

## Note

Ensure you have the necessary permissions to read from and write to the specified directory. Always backup your files before running this script, as it modifies the original spec files.
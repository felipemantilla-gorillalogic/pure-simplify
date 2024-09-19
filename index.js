#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import chalk from 'chalk';
import readline from 'readline';
import cliProgress from 'cli-progress';

function findSpecFilesAndRelated(dir, filesList = []) {

  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findSpecFilesAndRelated(fullPath, filesList);
    } else {
      if (item.endsWith('.spec.js') || item.endsWith('.spec.ts') || item.endsWith('.spec.vue')) {
        const relatedFileName = item.replace('.spec.', '.');
        let relatedFilePath = path.join(dir, relatedFileName);

        // Check if the related file exists in the same directory
        if (fs.existsSync(relatedFilePath)) {
        } else {
          // If not found, check in the parent directory
          const parentDir = path.dirname(dir);
          relatedFilePath = path.join(parentDir, relatedFileName);

          if (!fs.existsSync(relatedFilePath)) {
            relatedFilePath = null;
          }
        }

        filesList.push({
          specFileName: item,
          specFilePath: fullPath,
          relatedFileName: relatedFilePath ? relatedFileName : null,
          relatedFilePath: relatedFilePath,
        });
      }
    }
  });

  return filesList;
}

async function sendToClaudeForReview(specContent, relatedContent) {
  const prompt = `
    Please review the following test file and simplify it by:
    
    1. Removing unnecessary or unhelpful tests
    2. Identifying parts within tests that are not useful
    3. Cleaning and simplifying existing tests
    4. DO NOT REMOVE ANY COMMENTS, ONLY TESTS
    5. DO NOT REFACTOR IMPORTS
    6. DO NOT REMOVE SPACES OR END OF LINES, KEEP THE FORMAT OF THE FILES AS IT IS.
    7. REMOVE ALL THE IMPORTS THAT WOULDNT BE NEEDED IF THE TESTS ARE SIMPLIFIED.
    
    Do not add any new tests or content. The goal is to streamline the test suite while maintaining its effectiveness.
    
    Test file content:
    ${specContent}
    ${relatedContent ? `Related file content: ${relatedContent}` : 'No related file content available.'}
    
    REMOVE ALL TESTS THAT ARE NOT USEFUL AND ONLY KEEP THE USEFUL ONES. REMOVE TESTS THAT ARE TESTING BASIC FUNCTIONALITY THAT IS NOT NEEDED.
    
    Present your response in the following JSON format:
    
    {
      "specFileName": "specFileName",
      "specFilePath": "specFilePath",
      "analysis": "Your analysis of the test file and suggestions for improvement",
      "newSpecContent": "The simplified test file content"
    }
    
    IMPORTANT:
    1. Return ONLY the JSON object and nothing else.
    2. Ensure the JSON is valid and contains no syntax errors.
    3. Make sure all string values are properly escaped.
    4. Verify that the JSON object is parsable by JSON.parse().
    5. Do not include any explanations or comments outside the JSON object.
    6. Ensure all required fields are present and non-empty.
    7. Double-check that no unintended characters are included in the JSON.
    
    Before submitting your response, validate that:
    1. The response starts with an opening curly brace '{' and ends with a closing curly brace '}'.
    2. All property names are enclosed in double quotes.
    3. There are no trailing commas after the last property in objects.
    4. The "newSpecContent" field does not contain any unescaped newline characters or quotes that would break the JSON structure.
    
    If you cannot generate a valid JSON response, respond with an error message in JSON format explaining the issue.
    `;
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key':
            process.env.CLAUDE_API_KEY,
        },
      },
    );

    if (response.data && response.data.content && response.data.content.length > 0) {
      // Sanitize the response before returning
      return response.data.content[0].text;
    } else {
      console.error(chalk.red('Unexpected response format from Claude:'), response.data);
      return null;
    }
  } catch (error) {
    console.error(chalk.red('Error sending to Claude:'), error.response ? error.response.data : error.message);
    return null;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const main = async () => {
  // Prompt user for directory path
  const startDir = await new Promise((resolve) => {
    rl.question(chalk.yellow('Enter the directory path to search for spec files: '), (answer) => {
      resolve(answer.trim());
    });
  });

  if (!fs.existsSync(startDir)) {
    console.error(chalk.red(`Error: Directory "${startDir}" does not exist.`));
    rl.close();
    return;
  }

  console.log(chalk.blue(`Starting search for spec files and related files in directory: ${startDir}`));

  const result = findSpecFilesAndRelated(startDir);

  console.log(chalk.green(`Search completed. Found ${result.length} spec files.`));

  console.log(chalk.cyan('Total spec files: '), result.length);
  console.log(chalk.cyan('Spec files with related files: '), result.filter((file) => file.relatedFileName !== null).length);

  // Object to store processed files and their status
  const processedFiles = {
    success: [],
    error: [],
    skipped: []
  };

  // Create a new progress bar instance
  const progressBar = new cliProgress.SingleBar({
    format: 'Simplifying Spec Files |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} Files',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  // Initialize the progress bar
  progressBar.start(result.length, 0);

  // Generate initial report
  const reportFileName = `simplify_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(startDir, reportFileName);

  const updateReport = async () => {
    const report = {
      totalProcessed: processedFiles.success.length + processedFiles.error.length + processedFiles.skipped.length,
      successfullyProcessed: processedFiles.success.length,
      errors: processedFiles.error.length,
      skipped: processedFiles.skipped.length,
      successfulFiles: processedFiles.success,
      errorFiles: processedFiles.error,
      skippedFiles: processedFiles.skipped
    };

    try {
      await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
    } catch (error) {
      console.error(chalk.red(`Error updating report file: ${error.message}`));
    }
  };

  // New code to iterate through each object in the array and get the content of each test file
  for (let i = 0; i < result.length; i++) {
    const specFile = result[i];

    try {
      const specContent = fs.readFileSync(specFile.specFilePath, 'utf8');
      const sanitizedSpecContent = specContent.replace(/[^\x20-\x7E]/g, ''); // Remove non-printable characters
      let sanitizedRelatedContent = null;

      let relatedContent = null;
      if (specFile.relatedFilePath) {
        relatedContent = fs.readFileSync(specFile.relatedFilePath, 'utf8');
        sanitizedRelatedContent = relatedContent.replace(/[^\x20-\x7E]/g, ''); // Remove non-printable characters
      }

      // Send to Claude for review
      let claudeResponse = null;
      const maxRetries = 3;
      let retries = 0;

      while (retries < maxRetries && !claudeResponse) {
        try {
          claudeResponse = await sendToClaudeForReview(sanitizedSpecContent, sanitizedRelatedContent);
          if (claudeResponse) {
            try {
              const parsedResponse = JSON.parse(claudeResponse);

              if (parsedResponse.newSpecContent) {
                // Ensure the new content ends with a newline
                const newContent = parsedResponse.newSpecContent.endsWith('\n')
                  ? parsedResponse.newSpecContent
                  : parsedResponse.newSpecContent + '\n';
                
                fs.writeFileSync(specFile.specFilePath, newContent, 'utf8');
                processedFiles.success.push(specFile.specFilePath);
                await updateReport();
              } else {
                console.log(chalk.yellow(`\n\nNo new content received for ${specFile.specFileName}. File skipped.\n`));
                processedFiles.skipped.push(specFile.specFilePath);
                await updateReport();
              }
            } catch (parseError) {
              console.error(chalk.red('Error parsing Claude response:'), parseError);
              console.error(chalk.red('Raw response:'), claudeResponse);
              claudeResponse = null; // Reset to null to trigger retry
            }
          }
        } catch (error) {
          console.error(chalk.red(`Error sending to Claude (attempt ${retries + 1}):`, error));
          claudeResponse = null; // Reset to null to trigger retry
        }

        if (!claudeResponse) {
          retries++;
          if (retries < maxRetries) {
            console.log(chalk.yellow(`Retrying... (attempt ${retries + 1} of ${maxRetries})`));
            await new Promise((resolve) => setTimeout(resolve, 1000 * retries)); // Wait before retrying
          } else {
            console.log(chalk.red(`Failed to receive response from Claude for ${specFile.specFileName} after ${maxRetries} attempts`));
            processedFiles.error.push({
              file: specFile.specFileName,
              error: `Failed to receive response after ${maxRetries} attempts`,
            });
            await updateReport();
          }
        }
      }

      if (!claudeResponse) {
        console.log(chalk.red(`Failed to receive response from Claude for ${specFile.specFileName} after ${maxRetries} attempts`));
        processedFiles.error.push({
          file: specFile.specFileName,
          error: `Failed to receive response after ${maxRetries} attempts`,
        });
        await updateReport();
      }
    } catch (error) {
      console.error(chalk.red(`Error processing file ${specFile.specFileName}:`, error.message));
      console.error(error);
      processedFiles.error.push({
        file: specFile.specFileName,
        error: error.message,
      });
      await updateReport();
    }

    // Update the progress bar
    progressBar.update(i + 1);
  }

  // Stop the progress bar
  progressBar.stop();

  console.log('\n'); // New line after progress bar
  console.log(chalk.cyan.bold('\nProcessed Files Summary:'));
  console.log(chalk.green('✓ Successfully processed:'), processedFiles.success.length);
  console.log(chalk.yellow('⚠ Skipped:'), processedFiles.skipped.length);
  console.log(chalk.red('✗ Errors:'), processedFiles.error.length);

  console.log(chalk.cyan(`\nFinal report generated: ${reportPath}`));

  rl.close();
};

main().catch((error) => {
  console.error(chalk.red('Error in main:', error));
  rl.close();
});
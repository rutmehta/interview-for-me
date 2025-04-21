// ProcessingHelper.ts

import fs from "node:fs"
import FormData from "form-data"
import axios from "axios"
import { ScreenshotHelper } from "./ScreenshotHelper" // Adjust the import path if necessary
import { AppState } from "./main" // Adjust the import path if necessary
import dotenv from "dotenv"
import { OpenAI } from "openai"
import path from "path"
import fsExtra from "fs-extra"

dotenv.config()

console.log({ NODE_ENV: process.env.NODE_ENV })
const isDev = process.env.NODE_ENV === "development"

const baseUrl = isDev
  ? "http://localhost:8000"
  : "https://web-production-b2eb.up.railway.app"

console.log({ baseUrl })
const isDevTest = process.env.IS_DEV_TEST === "true"

const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500 // in milliseconds

console.log({ isDev, isDevTest, MOCK_API_WAIT_TIME })

// Initialize OpenAI client
// Note: You need to set OPENAI_API_KEY as an environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export class ProcessingHelper {
  private appState: AppState
  private screenshotHelper: ScreenshotHelper

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(appState: AppState) {
    this.appState = appState
    this.screenshotHelper = appState.getScreenshotHelper()
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    const view = this.appState.getView()

    if (view === "queue") {
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      if (screenshotQueue.length === 0) {
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS
        )
        return
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.appState.setView("solutions")

      // Initialize AbortController
      this.currentProcessingAbortController = new AbortController()
      const { signal } = this.currentProcessingAbortController

      try {
        const screenshots = await Promise.all(
          screenshotQueue.map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path)
          }))
        )

        console.log("Regular screenshots")
        screenshots.forEach((screenshot: any) => {
          console.log(screenshot.path)
        })

        const result = await this.processScreenshotsHelper(screenshots, signal)

        if (result.success) {
          console.log("Processing success:", result.data)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          console.log("Processing request canceled")
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          console.error("Processing error:", error)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message
          )
        }
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      //view == solutions
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      if (extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots to process")
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS
        )
        return
      }
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        const screenshots = await Promise.all(
          [
            ...this.screenshotHelper.getScreenshotQueue(),
            ...extraScreenshotQueue
          ].map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path)
          }))
        )

        const result = await this.processExtraScreenshotsHelper(
          screenshots,
          signal
        )

        if (result.success) {
          this.appState.setHasDebugged(true)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error) {
        if (axios.isCancel(error)) {
          console.log("Extra processing request canceled")
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          console.error("Processing error:", error)
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  public async processAudioInput(audioFilePath: string): Promise<any> {
    try {
      const mainWindow = this.appState.getMainWindow();
      if (!mainWindow) return { success: false, error: "Main window not available" };

      // Initialize AbortController
      this.currentProcessingAbortController = new AbortController();
      const { signal } = this.currentProcessingAbortController;

      try {
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START);
        this.appState.setView("solutions");

        console.log(`Processing audio file: ${audioFilePath}`);
        
        // Check if the file exists
        if (!await fsExtra.pathExists(audioFilePath)) {
          throw new Error(`Audio file not found: ${audioFilePath}`);
        }

        console.log("Audio file exists, starting processing");
        
        try {
          // Step 1: Transcribe the audio using OpenAI's API
          console.log("Transcribing audio with OpenAI...");
          
          // Use the OpenAI SDK directly with a ReadStream
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioFilePath),
            model: "whisper-1", // Using the available Whisper model
          });
          
          // Extract the transcript
          const transcript = transcription.text;
          console.log("TRANSCRIPTION COMPLETE:", transcript);
          
          // Display the transcript in a clear way in the console
          const transcriptBox = `
╔════════════════════════════════════════════════════════════════════════════════╗
║ TRANSCRIPT:                                                                    ║
╠════════════════════════════════════════════════════════════════════════════════╣
║ ${transcript.replace(/(.{78})/g, "$1\n║ ")}
╚════════════════════════════════════════════════════════════════════════════════╝`;
          
          console.log(transcriptBox);
          
          // Step 2: Analyze the transcript to determine if it's a coding question
          console.log("Analyzing transcript to identify question type...");
          const analysisResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are an expert at analyzing programming-related questions. Your task is to determine if the transcript contains a coding problem, technical interview question, or general programming question. Identify the type of question and structure it appropriately."
              },
              {
                role: "user",
                content: `Analyze this transcript from a technical interview and determine what type of question it is. It could be a coding problem (like a LeetCode problem), a design question, a technical knowledge question, or something else. Extract the key information and format it appropriately. If it's a coding problem, identify the problem statement, input/output format, constraints, and any test cases mentioned.\n\nTranscript: ${transcript}`
              }
            ],
            max_tokens: 1024,
          });
          
          const analysis = analysisResponse.choices[0]?.message?.content || "";
          console.log("Question analysis:", analysis);
          
          // Step 3: Extract the question structure based on the analysis
          const extractionResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are an expert at structuring programming questions for solution generation. Based on the question analysis, extract and format the question in a structured JSON format."
              },
              {
                role: "user",
                content: `Based on this analysis of a technical interview question, extract and structure the question in JSON format. If it's a coding problem (like a LeetCode problem), the JSON should include 'type' set to 'leetcode_problem', 'problem_statement', 'input_format' (with description and parameters array), 'output_format' (with description and type), 'constraints' array, and 'test_cases' array. If it's a technical knowledge or design question, the JSON should include 'type' set to 'technical_question', 'question', 'context', and 'expected_answer_topics' array.\n\nAnalysis: ${analysis}\n\nTranscript: ${transcript}`
              }
            ],
            max_tokens: 1500,
            response_format: { type: "json_object" }
          });
          
          const extractedQuestion = extractionResponse.choices[0]?.message?.content || "";
          console.log("Extracted question structure:", extractedQuestion);
          
          // Parse the extracted question
          let questionData;
          try {
            questionData = JSON.parse(extractedQuestion);
          } catch (e) {
            console.error("Error parsing question JSON:", e);
            // Try to extract JSON from the response
            const jsonMatch = extractedQuestion.match(/```json\n([\s\S]*?)\n```/) || 
                            extractedQuestion.match(/{[\s\S]*}/) ||
                            [null, extractedQuestion];
            
            const jsonContent = jsonMatch[1] || extractedQuestion;
            questionData = JSON.parse(jsonContent);
          }
          
          // Determine the question type and structure
          const questionType = questionData.type || "technical_question";
          
          // Store problem info in AppState
          const problemInfo = {
            type: questionType,
            ...questionData
          };
          
          this.appState.setProblemInfo(problemInfo);
          
          // Send problem extracted event
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            problemInfo
          );
          
          // Generate a solution
          console.log("Generating solution...");
          
          let formattedSolution;
          
          if (questionType === "leetcode_problem") {
            const leetcodeSolutionResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are an expert programmer who provides optimal solutions to coding problems with detailed explanations and time/space complexity analysis."
                },
                {
                  role: "user",
                  content: `Solve this coding problem with detailed explanations, time and space complexity analysis, and code in both Python and JavaScript:\n\n${JSON.stringify(problemInfo)}`
                }
              ],
              max_tokens: 2500,
            });
            
            const solution = leetcodeSolutionResponse.choices[0]?.message?.content || "";
            
            // Extract code blocks
            const pythonCodeMatch = solution.match(/```python\s*([\s\S]*?)\s*```/);
            const jsCodeMatch = solution.match(/```javascript\s*([\s\S]*?)\s*```/) || solution.match(/```js\s*([\s\S]*?)\s*```/);
            
            formattedSolution = {
              type: "leetcode_problem",
              problem_statement: problemInfo.problem_statement,
              input_format: problemInfo.input_format,
              output_format: problemInfo.output_format,
              constraints: problemInfo.constraints,
              test_cases: problemInfo.test_cases,
              solution: {
                explanation: solution,
                code: pythonCodeMatch ? pythonCodeMatch[1] : "# No Python solution provided",
                code_map: {
                  python: pythonCodeMatch ? pythonCodeMatch[1] : "# No Python solution provided",
                  javascript: jsCodeMatch ? jsCodeMatch[1] : "// No JavaScript solution provided"
                },
                time_complexity: solution.match(/[tT]ime [cC]omplexity:?\s*(O\([^)]+\))/)?.[1] || "O(n)",
                space_complexity: solution.match(/[sS]pace [cC]omplexity:?\s*(O\([^)]+\))/)?.[1] || "O(n)"
              }
            };
          } else {
            // Technical question or design question
            const technicalSolutionResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are a technical interview expert who provides detailed answers to technical questions. Format your response in a clear, organized way with examples where appropriate."
                },
                {
                  role: "user",
                  content: `Please provide a detailed answer to this technical question: ${questionData.question}\n\nContext: ${questionData.context || "General programming question"}`
                }
              ],
              max_tokens: 2000,
            });
            
            const solution = technicalSolutionResponse.choices[0]?.message?.content || "";
            
            // Extract code example if present
            const codeExampleMatch = solution.match(/```(?:javascript|js|python|java|c\+\+|cpp|typescript|ts)\s*([\s\S]*?)\s*```/);
            const codeExample = codeExampleMatch ? codeExampleMatch[0] : "";
            
            // Extract key points
            const keyPointsMatch = solution.match(/(?:Key Points|Summary|Important Points|Key Takeaways):([\s\S]*?)(?:\n\n|\n#|\n\*\*|$)/i);
            let keyPoints = [];
            
            if (keyPointsMatch) {
              keyPoints = keyPointsMatch[1].split(/\n\s*[\-\*]\s*/).filter(Boolean).map(point => point.trim());
            } else {
              // Create some basic key points from the solution
              keyPoints = solution.split(/\n\n/).slice(0, 5).map(p => p.substring(0, 100).trim()).filter(Boolean);
            }
            
            formattedSolution = {
              type: questionType,
              question: questionData.question,
              context: questionData.context,
              expected_answer_topics: questionData.expected_answer_topics || [],
              solution: {
                answer: solution,
                key_points: keyPoints.length > 0 ? keyPoints : [
                  "Key point 1 from answer",
                  "Key point 2 from answer",
                  "Key point 3 from answer"
                ],
                code_example: codeExample
              }
            };
          }
          
          // Send the formatted solution
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            formattedSolution
          );
          
          return { success: true, data: formattedSolution };
        } catch (error) {
          console.error("Error during audio processing:", error);
          throw error;
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          console.log("Audio processing request canceled");
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Audio processing was canceled by the user."
          );
        } else {
          console.error("Audio processing error:", error);
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message
          );
        }
        return { success: false, error: error.message };
      } finally {
        this.currentProcessingAbortController = null;
      }
    } catch (error: any) {
      console.error("Audio processing error:", error);
      return { success: false, error: error.message };
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string }>,
    signal: AbortSignal
  ) {
    try {
      try {
        let problemResponse;

        if (!isDevTest) {
          // Process screenshots with OpenAI
          const screenshotPromises = screenshots.map(async (screenshot) => {
            try {
              return await fs.promises.readFile(screenshot.path);
            } catch (error) {
              console.error(`Error reading file ${screenshot.path}:`, error);
              throw error;
            }
          });

          const screenshotBuffers = await Promise.all(screenshotPromises);
          
          // Extract content from screenshots using OpenAI's Vision model
          console.log("Sending screenshots to OpenAI for processing...");
          const extractionResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are an expert at analyzing programming tasks from screenshots. You can extract both structured LeetCode problems and general technical requirements. Identify the type of content in the screenshots and provide an appropriate structured response."
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Analyze these screenshot(s) and determine if they contain a LeetCode/coding problem or general technical requirements (like building an app). Return a JSON structure with a 'type' field that is either 'leetcode_problem' or 'technical_requirement'. For LeetCode problems, include: problem_statement, input_format (with description and parameters array), output_format (with description and type), constraints array, and test_cases array. For technical requirements, include: project_title, requirements_list, tech_stack, and optional features." },
                  ...screenshotBuffers.map(buffer => ({
                    type: "image_url" as const,
                    image_url: {
                      url: `data:image/png;base64,${buffer.toString('base64')}`
                    }
                  }))
                ]
              }
            ],
            max_tokens: 4096,
          });
          
          // Parse the AI response to JSON
          const aiResponse = extractionResponse.choices[0]?.message?.content || "";
          console.log("OpenAI extraction response:", aiResponse);
          
          // Extract JSON from response
          const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || 
                           aiResponse.match(/{[\s\S]*}/) ||
                           [null, aiResponse];
          
          const jsonContent = jsonMatch[1] || aiResponse;
          let parsedContent;
          
          try {
            parsedContent = JSON.parse(jsonContent);
          } catch (e) {
            console.error("Error parsing JSON response from OpenAI:", e);
            // Try to find anything that looks like a JSON object
            try {
              // Try to find anything that looks like a JSON object
              const potentialJson = aiResponse.substring(
                aiResponse.indexOf('{'), 
                aiResponse.lastIndexOf('}') + 1
              );
              parsedContent = JSON.parse(potentialJson);
            } catch (e2) {
              console.error("Error parsing JSON (second attempt):", e2);
              throw new Error("Failed to parse content from OpenAI response");
            }
          }
          
          // Check the type of content extracted
          const contentType = parsedContent.type || "leetcode_problem"; // Default to leetcode_problem for backward compatibility
          
          if (contentType === "leetcode_problem") {
            // Handle LeetCode problem extraction (existing logic)
            problemResponse = {
              data: {
                type: "leetcode_problem",
                problem_statement: parsedContent.problem_statement || "",
                input_format: parsedContent.input_format || {
                  description: "Input parameters",
                  parameters: []
                },
                output_format: parsedContent.output_format || {
                  description: "Output value",
                  type: "any"
                },
                constraints: parsedContent.constraints || [],
                test_cases: parsedContent.test_cases || []
              }
            };
          } else if (contentType === "technical_requirement") {
            // Handle technical requirement extraction
            problemResponse = {
              data: {
                type: "technical_requirement",
                project_title: parsedContent.project_title || "Technical Project",
                requirements_list: parsedContent.requirements_list || [],
                tech_stack: parsedContent.tech_stack || [],
                optional_features: parsedContent.optional_features || []
              }
            };
          }
        } else {
          // Simulate API delay
          console.log(
            `Simulating extract_problem API delay of ${MOCK_API_WAIT_TIME}ms`
          )
          await new Promise((resolve) =>
            setTimeout(resolve, MOCK_API_WAIT_TIME)
          )

          // Use constants matching the expected output format
          problemResponse = {
            data: {
              type: "leetcode_problem",
              problem_statement: "Sample problem statement",
              input_format: {
                description: "Sample input description",
                parameters: [
                  {
                    name: "n",
                    type: "number",
                    subtype: "integer"
                  },
                  {
                    name: "arr",
                    type: "array",
                    subtype: "integer"
                  }
                ]
              },
              output_format: {
                description: "Sample output description",
                type: "number",
                subtype: "integer"
              },
              constraints: [
                {
                  description: "1 ≤ n ≤ 1000",
                  parameter: "n",
                  range: {
                    min: 1,
                    max: 1000
                  }
                }
              ],
              test_cases: [
                {
                  input: {
                    args: [5, [1, 2, 3, 4, 5]]
                  },
                  output: {
                    result: 15
                  }
                }
              ]
            }
          }
        }

        // Store problem info in AppState
        this.appState.setProblemInfo({
          type: problemResponse.data.type || "leetcode_problem",
          ...problemResponse.data
        })

        // Send first success event
        const mainWindow = this.appState.getMainWindow()
        if (mainWindow) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            problemResponse.data
          )
        }

        // Second API call - generate solutions
        if (mainWindow) {
          const solutionsResult = await this.generateSolutionsHelper(signal)
          if (solutionsResult.success) {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
              solutionsResult.data
            )
            return { success: true, data: solutionsResult.data }
          } else {
            throw new Error(
              solutionsResult.error || "Failed to generate solutions"
            )
          }
        }

        return { success: true, data: problemResponse.data }
      } catch (error: any) {
        const mainWindow = this.appState.getMainWindow()
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          if (mainWindow) {
            //RESET FUNCTIONALITY

            // Cancel ongoing API requests
            this.appState.processingHelper.cancelOngoingRequests()

            // Clear both screenshot queues
            this.appState.clearQueues()

            console.log("Cleared queues.")

            // Update the view state to 'queue'
            this.appState.setView("queue")

            // Notify renderer process to switch view to 'queue'
            const mainWindow = this.appState.getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("reset-view")
            }

            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.UNAUTHORIZED,
              "Authentication required"
            )
          }
          this.appState.setView("queue")
          throw new Error("Authentication required")
        }
        throw error
      }
    } catch (error) {
      console.error("Processing error:", error)
      return { success: false, error: error.message }
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.appState.getProblemInfo()
      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      try {
        let response;

        if (!isDevTest) {
          console.log("Generating solution with OpenAI...");
          
          // Determine the content type
          const contentType = problemInfo.type || "leetcode_problem";
          
          if (contentType === "leetcode_problem") {
            // Format the problem info for OpenAI - LeetCode problem
            const problemStatement = problemInfo.problem_statement;
            const inputFormat = JSON.stringify(problemInfo.input_format, null, 2);
            const outputFormat = JSON.stringify(problemInfo.output_format, null, 2);
            const constraints = JSON.stringify(problemInfo.constraints, null, 2);
            const testCases = JSON.stringify(problemInfo.test_cases, null, 2);
            
            // Generate solution with OpenAI for LeetCode problem
            const solutionResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `You are a coding expert tasked with generating optimal solutions for programming problems. 
                          Please analyze the provided problem carefully and provide the best solution.
                          Include detailed explanations, time and space complexity analysis, and elegant code.
                          I need solutions in BOTH JavaScript and Python.
                          Format your response as a valid JSON object with the following structure:
                          {
                            "solution": {
                              "explanation": "Detailed explanation of your approach",
                              "complexity": {
                                "time": "O(...)",
                                "space": "O(...)"
                              },
                              "code": {
                                "javascript": "// Your JavaScript code here with proper line breaks",
                                "python": "# Your Python code here with proper line breaks"
                              }
                            },
                            "alternative_solutions": [
                              {
                                "explanation": "Alternative approach explanation",
                                "complexity": {
                                  "time": "O(...)",
                                  "space": "O(...)"
                                },
                                "code": {
                                  "javascript": "// Alternative JavaScript code",
                                  "python": "# Alternative Python code"
                                }
                              }
                            ]
                          }
                          Ensure your code has proper formatting, indentation, and line breaks. Do not escape newlines.
                          Do not include any explanations outside the JSON. The entire response must be valid JSON.`
                },
                {
                  role: "user",
                  content: `Here's the problem:
                          
                          ${JSON.stringify(problemInfo)}
                          
                          Generate an optimal solution with detailed explanations, and provide the full code implementation 
                          in BOTH JavaScript and Python.`
                }
              ],
              max_tokens: 4096,
              response_format: { type: "json_object" }
            });
            
            const aiSolutionResponse = solutionResponse.choices[0]?.message?.content || "";
            console.log("OpenAI solution response received");
            
            try {
              const parsedSolution = this.extractValidJson(aiSolutionResponse);
              
              // Ensure we have both JavaScript and Python solutions properly formatted
              const jsCode = parsedSolution.solution?.code?.javascript || 
                            "// No JavaScript solution available";
              
              const pythonCode = parsedSolution.solution?.code?.python || 
                                "# No Python solution available";
              
              // Store solution data for JavaScript/Python toggling
              const solutionCodeMap = {
                javascript: jsCode,
                python: pythonCode
              };
              
              // Get the default solution (Python)
              const defaultSolution = solutionCodeMap["python"];
              
              // Format the solution data to match what the UI component expects
              const formattedSolution = {
                solution: {
                  code: defaultSolution,
                  code_map: solutionCodeMap, // Add the code map for language switching
                  thoughts: [
                    parsedSolution.solution?.explanation || "No explanation available",
                    ...(Array.isArray(parsedSolution.alternative_solutions) 
                      ? parsedSolution.alternative_solutions.map((alt: any) => `Alternative: ${alt.explanation || ""}`) 
                      : [])
                  ],
                  time_complexity: parsedSolution.solution?.complexity?.time || "O(n)",
                  space_complexity: parsedSolution.solution?.complexity?.space || "O(n)"
                },
                type: "leetcode_problem",
                problem_statement: problemInfo.problem_statement,
                input_format: problemInfo.input_format,
                output_format: problemInfo.output_format,
                constraints: problemInfo.constraints,
                test_cases: problemInfo.test_cases
              };
              
              console.log("Formatted solution data:", formattedSolution);
              return { success: true, data: formattedSolution };
            } catch (e) {
              console.error("Failed to parse solution:", e);
              // Fallback to basic solutions if parsing fails
              const fallbackSolution = {
                solution: {
                  code: "# Solution could not be parsed from AI response\ndef findMedianSortedArrays(nums1, nums2):\n    merged = sorted(nums1 + nums2)\n    mid = len(merged) // 2\n    if len(merged) % 2 == 0:\n        return (merged[mid - 1] + merged[mid]) / 2\n    else:\n        return merged[mid]",
                  code_map: {
                    javascript: "// Solution could not be parsed from AI response\nfunction findMedianSortedArrays(nums1, nums2) {\n  const merged = [...nums1, ...nums2].sort((a, b) => a - b);\n  const mid = Math.floor(merged.length / 2);\n  return merged.length % 2 === 0\n    ? (merged[mid - 1] + merged[mid]) / 2\n    : merged[mid];\n}",
                    python: "# Solution could not be parsed from AI response\ndef findMedianSortedArrays(nums1, nums2):\n    merged = sorted(nums1 + nums2)\n    mid = len(merged) // 2\n    if len(merged) % 2 == 0:\n        return (merged[mid - 1] + merged[mid]) / 2\n    else:\n        return merged[mid]"
                  },
                  thoughts: [
                    "There was an error parsing the solution from the AI. Here's a simplified explanation:",
                    aiSolutionResponse.substring(0, 500) + "..."
                  ],
                  time_complexity: "O(n log n)",
                  space_complexity: "O(n)"
                },
                type: "leetcode_problem",
                problem_statement: problemInfo.problem_statement,
                input_format: problemInfo.input_format,
                output_format: problemInfo.output_format,
                constraints: problemInfo.constraints,
                test_cases: problemInfo.test_cases
              };
              
              return { success: true, data: fallbackSolution };
            }
          } else if (contentType === "technical_requirement") {
            // Handle technical requirement solution generation
            const projectTitle = problemInfo.project_title || "Technical Project";
            const requirementsList = JSON.stringify(problemInfo.requirements_list || [], null, 2);
            const techStack = JSON.stringify(problemInfo.tech_stack || [], null, 2);
            const optionalFeatures = JSON.stringify(problemInfo.optional_features || [], null, 2);
            
            // Generate solution with OpenAI for technical requirement
            const technicalSolutionResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `You are a full-stack development expert who creates detailed implementation plans and code examples.
                          You analyze technical requirements and provide structured solutions with file structures, code snippets, and implementation steps.
                          Format your response as a valid JSON with the following structure:
                          {
                            "project_plan": {
                              "overview": "Brief project description",
                              "architecture": "Description of the architecture",
                              "tech_stack": {
                                "frontend": ["React", "etc"],
                                "backend": ["Node.js", "etc"],
                                "database": ["MongoDB", "etc"],
                                "deployment": ["Vercel", "etc"]
                              }
                            },
                            "implementation_steps": [
                              {
                                "step": "Step description",
                                "details": "Implementation details"
                              }
                            ],
                            "file_structure": [
                              {
                                "path": "path/to/file.js",
                                "purpose": "Purpose of this file",
                                "code_sample": "// Example code content"
                              }
                            ],
                            "key_features": [
                              {
                                "feature": "Feature name",
                                "implementation": "How to implement"
                              }
                            ]
                          }
                          Ensure your response is comprehensive enough to guide implementation of the entire project.
                          Do not include any explanations outside the JSON. The entire response must be valid JSON.`
                },
                {
                  role: "user",
                  content: `Here are the technical requirements:
                  
                  Project Title: ${projectTitle}
                  
                  Requirements: ${requirementsList}
                  
                  Tech Stack Preferences: ${techStack}
                  
                  Optional Features: ${optionalFeatures}
                  
                  Please provide a complete implementation plan with detailed steps, file structure, and code examples.`
                }
              ],
              max_tokens: 4096,
              response_format: { type: "json_object" }
            });
            
            const aiTechnicalResponse = technicalSolutionResponse.choices[0]?.message?.content || "";
            console.log("OpenAI technical solution received");
            
            try {
              const parsedTechnicalSolution = this.extractValidJson(aiTechnicalResponse);
              
              // Format the solution data for technical requirements
              const formattedTechnicalSolution = {
                solution: {
                  project_plan: parsedTechnicalSolution.project_plan || {
                    overview: "Project overview not available",
                    architecture: "Architecture details not available",
                    tech_stack: {
                      frontend: [],
                      backend: [],
                      database: [],
                      deployment: []
                    }
                  },
                  implementation_steps: parsedTechnicalSolution.implementation_steps || [],
                  file_structure: parsedTechnicalSolution.file_structure || [],
                  key_features: parsedTechnicalSolution.key_features || []
                },
                type: "technical_requirement",
                project_title: problemInfo.project_title || "Technical Project",
                requirements_list: problemInfo.requirements_list || [],
                tech_stack: problemInfo.tech_stack || [],
                optional_features: problemInfo.optional_features || []
              };
              
              console.log("Formatted technical solution data:", formattedTechnicalSolution);
              return { success: true, data: formattedTechnicalSolution };
            } catch (e) {
              console.error("Failed to parse technical solution:", e);
              // Fallback for technical requirements
              const fallbackTechnicalSolution = {
                solution: {
                  project_plan: {
                    overview: "Could not parse project plan from AI response",
                    architecture: "Basic React frontend with Node.js backend",
                    tech_stack: {
                      frontend: ["React", "CSS"],
                      backend: ["Node.js", "Express"],
                      database: ["MongoDB"],
                      deployment: ["Vercel", "Heroku"]
                    }
                  },
                  implementation_steps: [
                    {
                      step: "Set up project structure",
                      details: "Initialize frontend and backend repositories"
                    },
                    {
                      step: "Implement core features",
                      details: "Build the main functionality required"
                    },
                    {
                      step: "Add styling and finalize UI",
                      details: "Complete the user interface design"
                    }
                  ],
                  file_structure: [
                    {
                      path: "src/App.js",
                      purpose: "Main application component",
                      code_sample: "import React from 'react';\n\nfunction App() {\n  return <div>Sample App</div>;\n}\n\nexport default App;"
                    }
                  ],
                  key_features: [
                    {
                      feature: "Sample Feature",
                      implementation: "Implementation details"
                    }
                  ]
                },
                type: "technical_requirement",
                project_title: problemInfo.project_title || "Technical Project",
                requirements_list: problemInfo.requirements_list || [],
                tech_stack: problemInfo.tech_stack || [],
                optional_features: problemInfo.optional_features || []
              };
              
              return { success: true, data: fallbackTechnicalSolution };
            }
          }
        } else {
          // Simulate API delay for development testing
          console.log(
            `Simulating generate_solutions API delay of ${MOCK_API_WAIT_TIME}ms`
          )
          await new Promise((resolve) =>
            setTimeout(resolve, MOCK_API_WAIT_TIME)
          )

          // Determine content type for mock response
          const contentType = problemInfo.type || "leetcode_problem";
          
          if (contentType === "leetcode_problem") {
            // Use constants matching the expected output format for LeetCode
            response = {
              data: {
                type: "leetcode_problem",
                problem_statement: problemInfo.problem_statement,
                input_format: problemInfo.input_format,
                output_format: problemInfo.output_format,
                constraints: problemInfo.constraints,
                test_cases: problemInfo.test_cases,
                solutions: [
                  {
                    explanation:
                      "This is an example solution. We iterate through the array and sum up all elements.",
                    complexity: {
                      time: "O(n)",
                      space: "O(1)"
                    },
                    code: {
                      javascript:
                        "function solution(n, arr) {\n  let sum = 0;\n  for (let i = 0; i < n; i++) {\n    sum += arr[i];\n  }\n  return sum;\n}",
                      python:
                        "def solution(n, arr):\n    return sum(arr)"
                    }
                  },
                  {
                    explanation:
                      "This is an alternative solution using reduce.",
                    complexity: {
                      time: "O(n)",
                      space: "O(1)"
                    },
                    code: {
                      javascript:
                        "function solution(n, arr) {\n  return arr.reduce((acc, val) => acc + val, 0);\n}",
                      python:
                        "from functools import reduce\n\ndef solution(n, arr):\n    return reduce(lambda x, y: x + y, arr, 0)"
                    }
                  }
                ]
              }
            }
          } else {
            // Mock response for technical requirement
            response = {
              data: {
                type: "technical_requirement",
                project_title: problemInfo.project_title || "Sample Technical Project",
                requirements_list: problemInfo.requirements_list || ["Feature 1", "Feature 2"],
                tech_stack: problemInfo.tech_stack || ["React", "Node.js"],
                optional_features: problemInfo.optional_features || ["Optional feature"],
                solution: {
                  project_plan: {
                    overview: "This is a sample project plan for development testing",
                    architecture: "React frontend with Node.js backend",
                    tech_stack: {
                      frontend: ["React", "CSS"],
                      backend: ["Node.js", "Express"],
                      database: ["MongoDB"],
                      deployment: ["Vercel"]
                    }
                  },
                  implementation_steps: [
                    {
                      step: "Step 1: Project Setup",
                      details: "Initialize frontend and backend repositories"
                    },
                    {
                      step: "Step 2: Core Features",
                      details: "Implement main functionality"
                    }
                  ],
                  file_structure: [
                    {
                      path: "src/App.js",
                      purpose: "Main application component",
                      code_sample: "import React from 'react';\n\nfunction App() {\n  return <div>Sample App</div>;\n}\n\nexport default App;"
                    }
                  ],
                  key_features: [
                    {
                      feature: "Sample Feature",
                      implementation: "Implementation details"
                    }
                  ]
                }
              }
            }
          }
        }
        return { success: true, data: response.data }
      } catch (error) {
        throw error
      }
    } catch (error) {
      console.error("Generate solutions error:", error)
      return { success: false, error: error.message }
    }
  }

  // Helper function to extract and sanitize JSON
  private extractValidJson(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      // Try to extract JSON from string with markdown code blocks
      const jsonMatch = jsonString.match(/```json\n([\s\S]*?)\n```/) || 
                       jsonString.match(/{[\s\S]*}/) ||
                       [null, jsonString];
      
      const jsonContent = jsonMatch[1] || jsonString;
      try {
        return JSON.parse(jsonContent);
      } catch (e2) {
        // Try one more approach - find anything between { and } brackets
        const potentialJson = jsonString.substring(
          jsonString.indexOf('{'), 
          jsonString.lastIndexOf('}') + 1
        );
        return JSON.parse(potentialJson);
      }
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string }>,
    signal: AbortSignal
  ) {
    try {
      const problemInfo = this.appState.getProblemInfo()
      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      if (!isDevTest) {
        try {
          // Process extra screenshots with OpenAI for debugging
          const screenshotPromises = screenshots.map(async (screenshot) => {
            try {
              return await fs.promises.readFile(screenshot.path);
            } catch (error) {
              console.error(`Error reading file ${screenshot.path}:`, error);
              throw error;
            }
          });

          const screenshotBuffers = await Promise.all(screenshotPromises);
          
          // Determine the content type
          const contentType = problemInfo.type || "leetcode_problem";
          
          if (contentType === "leetcode_problem") {
            console.log("Sending additional screenshots to OpenAI for LeetCode debugging...");
            
            // Get the current problem info and solution
            const problemStatement = problemInfo.problem_statement;
            const testCases = JSON.stringify(problemInfo.test_cases, null, 2);
            
            // Ask OpenAI to analyze the debug information
            const debugResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are an expert at debugging code and improving solutions for LeetCode problems. Analyze the screenshots which may contain error messages, failed test cases, or additional information about the problem."
                },
                {
                  role: "user",
                  content: [
                    { 
                      type: "text" as const, 
                      text: `The user is working on this LeetCode problem:
                      
Problem Statement:
${problemStatement}

Test Cases:
${testCases}

They've taken additional screenshots that may show error messages, failed test cases, or additional considerations.
Analyze these screenshots and provide debugging advice and an improved solution.

Return your response in JSON format with:
1. A debug_analysis explaining any issues found
2. An improved_solution with code for both JavaScript and Python`
                    },
                    ...screenshotBuffers.map(buffer => ({
                      type: "image_url" as const,
                      image_url: {
                        url: `data:image/png;base64,${buffer.toString('base64')}`
                      }
                    }))
                  ]
                }
              ],
              max_tokens: 4096,
            });
            
            const aiDebugResponse = debugResponse.choices[0]?.message?.content || "";
            console.log("OpenAI debug response received for LeetCode problem");
            
            // Process the response and return debug info
            const extractValidJson = (text: string): any => {
              console.log("Attempting to extract valid JSON");
              
              // Clean up any control characters that might be in the text
              const sanitizedText = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
              
              // Try direct parsing first
              try {
                return JSON.parse(sanitizedText);
              } catch (e) {
                console.log("Direct parsing failed, trying alternative methods");
              }
              
              // Look for JSON between triple backticks
              const jsonMatch = sanitizedText.match(/```json\n([\s\S]*?)\n```/) || 
                               sanitizedText.match(/```\n([\s\S]*?)\n```/) ||
                               sanitizedText.match(/```([\s\S]*?)```/);
              
              if (jsonMatch && jsonMatch[1]) {
                try {
                  return JSON.parse(jsonMatch[1]);
                } catch (e) {
                  console.log("Backtick JSON parsing failed", e);
                }
              }
              
              // Try to find anything that looks like a JSON object with balanced braces
              try {
                const startIdx = sanitizedText.indexOf('{');
                if (startIdx !== -1) {
                  let openBraces = 0;
                  let endIdx = -1;
                  
                  for (let i = startIdx; i < sanitizedText.length; i++) {
                    if (sanitizedText[i] === '{') openBraces++;
                    else if (sanitizedText[i] === '}') {
                      openBraces--;
                      if (openBraces === 0) {
                        endIdx = i + 1;
                        break;
                      }
                    }
                  }
                  
                  if (endIdx !== -1) {
                    const potentialJson = sanitizedText.substring(startIdx, endIdx);
                    // Clean up potential issues
                    const sanitized = potentialJson
                      .replace(/(\w+)(?=\s*:)/g, '"$1"') // Ensure property names are quoted
                      .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single quotes with double quotes
                      .replace(/,\s*}/g, '}') // Remove trailing commas
                      .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
                    
                    return JSON.parse(sanitized);
                  }
                }
              } catch (e) {
                console.log("Advanced JSON extraction failed", e);
              }
              
              // If all else fails, try to reconstruct a minimal valid JSON
              try {
                // Extract the most important parts if present
                const explanation = text.match(/explanation[\s\S]*?:[\s\S]*?["'](.+?)["']/i)?.[1] || "";
                const jsCode = text.match(/javascript[\s\S]*?:[\s\S]*?["'](.+?)["']/i)?.[1] || 
                           text.match(/```javascript\s*([\s\S]*?)\s*```/)?.[1] || "";
                const pyCode = text.match(/python[\s\S]*?:[\s\S]*?["'](.+?)["']/i)?.[1] || 
                          text.match(/```python\s*([\s\S]*?)\s*```/)?.[1] || "";
                
                return {
                  debug_analysis: explanation,
                  improved_solution: {
                    explanation: "Improved solution based on debug information",
                    complexity: { time: "O(n)", space: "O(n)" },
                    code: {
                      javascript: jsCode,
                      python: pyCode
                    }
                  }
                };
              } catch (e) {
                console.log("Last resort JSON creation failed", e);
                throw new Error("Could not extract valid JSON from response");
              }
            };
            
            const parsedDebug = extractValidJson(aiDebugResponse);
            
            // Construct response in expected format
            return {
              success: true,
              data: {
                problem_statement: problemInfo.problem_statement,
                input_format: problemInfo.input_format,
                output_format: problemInfo.output_format,
                constraints: problemInfo.constraints,
                test_cases: problemInfo.test_cases,
                debug_analysis: parsedDebug.debug_analysis || "Analysis of debug information",
                improved_solution: {
                  explanation: parsedDebug.improved_solution?.explanation || "",
                  complexity: parsedDebug.improved_solution?.complexity || { time: "O(n)", space: "O(n)" },
                  code: {
                    javascript: parsedDebug.improved_solution?.code?.javascript || "",
                    python: parsedDebug.improved_solution?.code?.python || ""
                  }
                }
              }
            };
          } else if (contentType === "technical_requirement") {
            console.log("Sending additional screenshots to OpenAI for technical project details...");
            
            // Get the current project requirements
            const projectTitle = problemInfo.project_title || "Technical Project";
            const requirementsList = JSON.stringify(problemInfo.requirements_list || [], null, 2);
            
            // Ask OpenAI to analyze the additional requirements/details
            const technicalDetailsResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are an expert at analyzing technical requirements and enhancing project plans. Review these additional screenshots which may contain more project details, specifications, or UI/UX requirements."
                },
                {
                  role: "user",
                  content: [
                    { 
                      type: "text" as const, 
                      text: `The user is building this technical project:
                      
Project Title: ${projectTitle}

Current Requirements: ${requirementsList}

They've taken additional screenshots that may show more specific details, mockups, or additional requirements.
Analyze these screenshots and provide enhanced project guidance.

Return your response in JSON format with:
1. An enhanced_requirements list with any new requirements discovered
2. Any UI/UX considerations found in the screenshots
3. Additional technical specifications that should be considered`
                    },
                    ...screenshotBuffers.map(buffer => ({
                      type: "image_url" as const,
                      image_url: {
                        url: `data:image/png;base64,${buffer.toString('base64')}`
                      }
                    }))
                  ]
                }
              ],
              max_tokens: 4096,
            });
            
            const aiTechnicalDetailsResponse = technicalDetailsResponse.choices[0]?.message?.content || "";
            console.log("OpenAI technical details response received");
            
            try {
              const parsedDetails = this.extractValidJson(aiTechnicalDetailsResponse);
              
              // Merge the new requirements with the existing ones
              const updatedRequirements = [
                ...(problemInfo.requirements_list || []),
                ...(parsedDetails.enhanced_requirements || [])
              ];
              
              // Format the enhanced project details
              const enhancedDetails = {
                type: "technical_requirement",
                project_title: problemInfo.project_title,
                requirements_list: updatedRequirements,
                tech_stack: problemInfo.tech_stack || [],
                optional_features: problemInfo.optional_features || [],
                ui_ux_considerations: parsedDetails.ui_ux_considerations || [],
                additional_specifications: parsedDetails.additional_specifications || []
              };
              
              // Update AppState with the enhanced info
              this.appState.setProblemInfo(enhancedDetails);
              
              // Notify main window
              const mainWindow = this.appState.getMainWindow();
              if (mainWindow) {
                mainWindow.webContents.send(
                  this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,  // Use an existing event type
                  enhancedDetails
                );
              }
              
              return { 
                success: true, 
                data: enhancedDetails
              };
            } catch (e) {
              console.error("Failed to parse technical details:", e);
              return { 
                success: false, 
                error: "Failed to process additional project details" 
              };
            }
          }
        } catch (error) {
          console.error("Error processing extra screenshots:", error);
          return { success: false, error: error.message };
        }
      } else {
        // Simulate API delay
        console.log(
          `Simulating process_extra_screenshots API delay of ${MOCK_API_WAIT_TIME}ms`
        )
        await new Promise((resolve) =>
          setTimeout(resolve, MOCK_API_WAIT_TIME)
        )

        // Use constants matching the expected output format
        return {
          success: true,
          data: {
            problem_statement: problemInfo.problem_statement,
            input_format: problemInfo.input_format,
            output_format: problemInfo.output_format,
            constraints: problemInfo.constraints,
            test_cases: problemInfo.test_cases,
            debug_analysis: "This is a simulated debug analysis.",
            improved_solution: {
              explanation: "This is an improved solution after debugging.",
              complexity: { time: "O(n)", space: "O(1)" },
              code: {
                javascript:
                  "function improvedSolution(n, arr) {\n  return arr.reduce((acc, val) => acc + val, 0);\n}",
                python: "def improved_solution(n, arr):\n    return sum(arr)"
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Process extra screenshots error:", error);
      return { success: false, error: error.message };
    }
  }

  public cancelOngoingRequests(): void {
    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
    }
  }
}

// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastDescription,
  ToastMessage,
  ToastTitle,
  ToastVariant
} from "../components/ui/toast"
import { ProblemData, TechnicalRequirementData, TechnicalSolution, ProblemStatementData, BaseProblemData } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Extracting problem statement...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-gray-100 max-w-[600px]">
        {content}
      </div>
    )}
  </div>
)

const SolutionSection = ({
  title,
  content,
  isLoading,
  language = "javascript",
  onLanguageChange
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
  language?: string
  onLanguageChange?: (language: string) => void
}) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        {title}
      </h2>
      {onLanguageChange && (
        <div className="text-xs text-gray-400">
          Press <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded">Cmd+L</kbd> to toggle language: <span className="text-white">{language === "javascript" ? "JavaScript" : language === "python" ? "Python" : language === "c" ? "C" : language === "cpp" ? "C++" : language}</span>
        </div>
      )}
    </div>
    {isLoading ? (
      <div className="space-y-1.5">
        <div className="mt-4 flex">
          <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
            Loading solutions...
          </p>
        </div>
      </div>
    ) : (
      <div className="w-full">
        <SyntaxHighlighter
          showLineNumbers
          language={language}
          style={dracula}
          customStyle={{
            maxWidth: "100%",
            margin: 0,
            padding: "1rem",
            whiteSpace: "pre-wrap",
            wordBreak: "normal"
          }}
          wrapLongLines={false}
          codeTagProps={{ 
            style: { 
              whiteSpace: 'pre', 
              display: 'block'
            } 
          }}
        >
          {content as string}
        </SyntaxHighlighter>
      </div>
    )}
  </div>
)

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      Complexity
    </h2>
    {isLoading ? (
      <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
        Calculating complexity...
      </p>
    ) : (
      <div className="space-y-1">
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Time:</strong> {timeComplexity}
          </div>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Space:</strong> {spaceComplexity}
          </div>
        </div>
      </div>
    )}
  </div>
)

interface SolutionsProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
}
const Solutions: React.FC<SolutionsProps> = ({ setView }) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<BaseProblemData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [solutionLanguage, setSolutionLanguage] = useState<string>("javascript")
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
  // Add state for technical requirements solutions
  const [technicalSolution, setTechnicalSolution] = useState<TechnicalSolution | null>(null)
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);

  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  const { data: extraScreenshots = [], refetch } = useQuery({
    queryKey: ["extras"],
    queryFn: async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        return []
      }
    },
    staleTime: Infinity,
    cacheTime: Infinity
  })

  const showToast = (
    title: string,
    description: string,
    variant: ToastVariant
  ) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch() // Refetch screenshots instead of managing state directly
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
    }
  }

  const handleLanguageChange = (language: string) => {
    setSolutionLanguage(language)
    
    // Update the displayed solution based on selected language
    const solutionData = queryClient.getQueryData(["solution"]) as any
    if (solutionData?.code_map && solutionData.code_map[language]) {
      setSolutionData(solutionData.code_map[language])
    }
  }

  const toggleLanguage = () => {
    const languagesList = ["javascript", "python", "c", "cpp"];
    const currentIndex = languagesList.indexOf(solutionLanguage);
    const nextIndex = (currentIndex + 1) % languagesList.length;
    const newLanguage = languagesList[nextIndex];
    handleLanguageChange(newLanguage);
  }

  const navigateToNextFile = () => {
    if (technicalSolution && technicalSolution.file_structure && technicalSolution.file_structure.length > 0) {
      setCurrentFileIndex((prevIndex) => 
        (prevIndex + 1) % technicalSolution.file_structure.length
      );
    }
  };

  const navigateToPrevFile = () => {
    if (technicalSolution && technicalSolution.file_structure && technicalSolution.file_structure.length > 0) {
      setCurrentFileIndex((prevIndex) => 
        prevIndex === 0 ? technicalSolution.file_structure.length - 1 : prevIndex - 1
      );
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Toggle language with Command+L instead of Alt+L
      if (event.metaKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        toggleLanguage();
      }
      // Navigate to next file with Command+] instead of Alt+Right
      if (event.metaKey && event.key === ']') {
        event.preventDefault();
        navigateToNextFile();
      }
      // Navigate to previous file with Command+[ instead of Alt+Left
      if (event.metaKey && event.key === '[') {
        event.preventDefault();
        navigateToPrevFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [solutionLanguage, technicalSolution, currentFileIndex]); // Re-attach when solutionLanguage or currentFileIndex changes

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Clear the queries
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["new_solution"])

        // Reset other states
        refetch()

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
      }),
      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        //we'll set the debug processing state to true and use that to render a little loader
        setDebugProcessing(true)
      }),
      window.electronAPI.onDebugSuccess((data) => {
        showToast(
          "Debug Analysis Complete",
          "The debug analysis has been completed and an improved solution generated.",
          "success"
        )
        setDebugProcessing(false)
        queryClient.setQueryData(["new_solution"], data)
        setView("debug")
      }),
      window.electronAPI.onDebugError((error) => {
        showToast(
          "Debug Analysis Failed",
          "There was an error processing your debug screenshots.",
          "error"
        )
        setDebugProcessing(false)
        console.error("Debug error:", error)
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your extra screenshots.",
          "error"
        )
        // Reset solutions in the cache (even though this shouldn't ever happen) and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null
        if (!solution) {
          setView("queue") //make sure that this is correct. or like make sure there's a toast or something
        }
        setSolutionData(solution?.code || null)
        setThoughtsData(solution?.thoughts || null)
        setTimeComplexityData(solution?.time_complexity || null)
        setSpaceComplexityData(solution?.space_complexity || null)
        console.error("Processing error:", error)
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess((data) => {
        if (!data?.solution) {
          console.warn("Received empty or invalid solution data")
          return
        }

        console.log({ solution: data.solution })

        // Handle different types of solutions based on content type
        if (data.type === 'technical_requirement') {
          // Set problem data
          const problemData: TechnicalRequirementData = {
            type: 'technical_requirement',
            project_title: data.project_title || 'Technical Project',
            requirements_list: data.requirements_list || [],
            tech_stack: data.tech_stack || [],
            optional_features: data.optional_features || []
          };
          
          // Set solution data
          const techSolution: TechnicalSolution = data.solution.project_plan ? {
            project_plan: data.solution.project_plan,
            implementation_steps: data.solution.implementation_steps || [],
            file_structure: data.solution.file_structure || [],
            key_features: data.solution.key_features || []
          } : {
            project_plan: {
              overview: "Project overview not available",
              architecture: "Architecture details not available",
              tech_stack: { 
                frontend: [], 
                backend: [], 
                database: [], 
                deployment: [] 
              }
            },
            implementation_steps: [],
            file_structure: [],
            key_features: []
          };
          
          setProblemStatementData(problemData);
          setTechnicalSolution(techSolution);
          
          // Store in query cache
          queryClient.setQueryData(["solution"], {
            type: 'technical_requirement',
            problemData,
            techSolution
          });
        } else {
          // Handle original LeetCode problem solution
          const solutionData = {
            code: data.solution.code,
            code_map: data.solution.code_map || {
              javascript: data.solution.code,
              python: "# No Python solution available"
            },
            thoughts: data.solution.thoughts,
            time_complexity: data.solution.time_complexity,
            space_complexity: data.solution.space_complexity
          }

          queryClient.setQueryData(["solution"], solutionData)
          setSolutionData(solutionData.code_map[solutionLanguage] || solutionData.code || null)
          setThoughtsData(solutionData.thoughts || null)
          setTimeComplexityData(solutionData.time_complexity || null)
          setSpaceComplexityData(solutionData.space_complexity || null)
        }
      }),
      //########################################################
    ]

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [
    queryClient,
    refetch,
    isTooltipVisible,
    tooltipHeight,
    setView,
    solutionLanguage,
    technicalSolution,
    currentFileIndex
  ])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  return (
    <div className="p-2 h-full w-full">
      <div className="flex flex-col h-full">
        <div className="pb-0 w-full">
          <SolutionCommands
            extraScreenshots={extraScreenshots}
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            currentLanguage={solutionLanguage}
            onLanguageToggle={toggleLanguage}
          />
        </div>

        {/* Toast for notifications */}
        <Toast
          open={toastOpen}
          onOpenChange={setToastOpen}
        >
          <ToastTitle>{toastMessage.title}</ToastTitle>
          <ToastDescription>{toastMessage.description}</ToastDescription>
        </Toast>

        <div
          ref={contentRef}
          className="flex-grow overflow-y-auto pt-2 space-y-8 max-w-6xl"
        >
          {/* Conditional rendering based on problem type */}
          {problemStatementData?.type === 'technical_requirement' ? (
            // Technical Requirement UI
            <>
              {/* Project Title and Requirements */}
              <ContentSection
                title="Project Requirements"
                content={
                  <div className="space-y-4">
                    <h3 className="text-[15px] font-semibold text-white">
                      {(problemStatementData as TechnicalRequirementData).project_title}
                    </h3>
                    
                    <div className="space-y-2">
                      <h4 className="text-[13px] font-medium text-gray-300">Requirements:</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        {(problemStatementData as TechnicalRequirementData).requirements_list.map((req, i) => (
                          <li key={i} className="text-[13px]">{req}</li>
                        ))}
                      </ul>
                    </div>
                    
                    {(problemStatementData as TechnicalRequirementData).tech_stack.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Tech Stack:</h4>
                        <div className="flex flex-wrap gap-2">
                          {(problemStatementData as TechnicalRequirementData).tech_stack.map((tech, i) => (
                            <span key={i} className="px-2 py-1 bg-gray-800 rounded text-[12px]">{tech}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {(problemStatementData as TechnicalRequirementData).optional_features.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Optional Features:</h4>
                        <ul className="list-disc pl-5 space-y-1">
                          {(problemStatementData as TechnicalRequirementData).optional_features.map((feature, i) => (
                            <li key={i} className="text-[13px]">{feature}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                }
                isLoading={!problemStatementData}
              />
              
              {/* Project Plan */}
              {technicalSolution?.project_plan && (
                <ContentSection
                  title="Project Plan"
                  content={
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Overview:</h4>
                        <p className="text-[13px]">{technicalSolution.project_plan.overview}</p>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Architecture:</h4>
                        <p className="text-[13px]">{technicalSolution.project_plan.architecture}</p>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Tech Stack:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {Object.entries(technicalSolution.project_plan.tech_stack).map(([category, items]) => (
                            items.length > 0 && (
                              <div key={category} className="space-y-1">
                                <h5 className="text-[12px] font-medium text-gray-400 capitalize">{category}:</h5>
                                <ul className="space-y-0.5">
                                  {items.map((item, i) => (
                                    <li key={i} className="text-[12px]">{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    </div>
                  }
                  isLoading={!technicalSolution}
                />
              )}
              
              {/* Implementation Steps */}
              {technicalSolution && technicalSolution.implementation_steps && technicalSolution.implementation_steps.length > 0 && (
                <ContentSection
                  title="Implementation Steps"
                  content={
                    <ol className="list-decimal pl-5 space-y-3">
                      {technicalSolution.implementation_steps.map((step, i) => (
                        <li key={i} className="text-[13px]">
                          <h4 className="font-medium">{step.step}</h4>
                          <p className="text-gray-300 mt-1">{step.details}</p>
                        </li>
                      ))}
                    </ol>
                  }
                  isLoading={!technicalSolution}
                />
              )}
              
              {/* File Structure with Code Samples */}
              {technicalSolution && technicalSolution.file_structure && technicalSolution.file_structure.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-[13px] font-medium text-white tracking-wide">
                    File Structure & Code Samples
                    {technicalSolution.file_structure.length > 1 && (
                      <span className="text-gray-400 text-[11px] ml-2">
                        (Use Cmd+[ and Cmd+] to navigate between files)
                      </span>
                    )}
                  </h2>
                  
                  {!technicalSolution ? (
                    <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                      Generating file structure...
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex gap-2 flex-wrap mb-2">
                        {technicalSolution.file_structure.map((file, i) => (
                          <button 
                            key={`tab-${i}`} 
                            className={`text-[11px] px-2 py-1 rounded-md ${currentFileIndex === i ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
                            onClick={() => setCurrentFileIndex(i)}
                          >
                            {file.path}
                          </button>
                        ))}
                      </div>
                      
                      {technicalSolution.file_structure.length > 0 && (
                        <div className="border border-gray-800 rounded-md overflow-hidden">
                          <div className="bg-gray-800 px-3 py-2 flex justify-between items-center">
                            <div className="flex items-center">
                              <span className="text-[13px] font-medium">
                                {technicalSolution.file_structure[currentFileIndex].path}
                              </span>
                            </div>
                            <span className="text-[12px] text-gray-400">
                              {technicalSolution.file_structure[currentFileIndex].purpose}
                            </span>
                          </div>
                          <SyntaxHighlighter
                            language={
                              technicalSolution.file_structure[currentFileIndex].path.endsWith('.js') || 
                              technicalSolution.file_structure[currentFileIndex].path.endsWith('.jsx') || 
                              technicalSolution.file_structure[currentFileIndex].path.endsWith('.ts') || 
                              technicalSolution.file_structure[currentFileIndex].path.endsWith('.tsx') 
                                ? 'javascript' 
                                : technicalSolution.file_structure[currentFileIndex].path.endsWith('.py') 
                                  ? 'python' 
                                  : technicalSolution.file_structure[currentFileIndex].path.endsWith('.cpp') || 
                                    technicalSolution.file_structure[currentFileIndex].path.endsWith('.c') 
                                      ? 'cpp' 
                                      : technicalSolution.file_structure[currentFileIndex].path.endsWith('.css') 
                                        ? 'css' 
                                        : technicalSolution.file_structure[currentFileIndex].path.endsWith('.html') 
                                          ? 'html' 
                                          : 'text'
                            }
                            style={dracula}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              fontSize: '13px',
                              lineHeight: 1.4
                            }}
                          >
                            {technicalSolution.file_structure[currentFileIndex].code_sample}
                          </SyntaxHighlighter>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Key Features */}
              {technicalSolution && technicalSolution.key_features && technicalSolution.key_features.length > 0 && (
                <ContentSection
                  title="Key Features"
                  content={
                    <div className="space-y-3">
                      {technicalSolution.key_features.map((feature, i) => (
                        <div key={i} className="border border-gray-800 rounded-md p-3">
                          <h4 className="text-[13px] font-medium">{feature.feature}</h4>
                          <p className="text-[13px] text-gray-300 mt-1">{feature.implementation}</p>
                        </div>
                      ))}
                    </div>
                  }
                  isLoading={!technicalSolution}
                />
              )}
              
              {/* Setup & Usage Instructions */}
              {technicalSolution && (
                <ContentSection
                  title="Setup & Usage Instructions"
                  content={
                    <div className="space-y-4">
                      {/* Setup Instructions */}
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Setup:</h4>
                        <ol className="list-decimal pl-5 space-y-1 text-[13px]">
                          {technicalSolution.project_plan.tech_stack.frontend.length > 0 && (
                            <li>
                              <span className="font-medium">Frontend Setup:</span>
                              <SyntaxHighlighter
                                language="bash"
                                style={dracula}
                                customStyle={{
                                  margin: '0.5rem 0',
                                  padding: '0.75rem',
                                  fontSize: '12px',
                                  borderRadius: '0.25rem'
                                }}
                              >
                                {`# Navigate to frontend directory
cd frontend
# Install dependencies
npm install
# Start development server
npm start`}
                              </SyntaxHighlighter>
                            </li>
                          )}
                          
                          {technicalSolution.project_plan.tech_stack.backend.length > 0 && (
                            <li>
                              <span className="font-medium">Backend Setup:</span>
                              <SyntaxHighlighter
                                language="bash"
                                style={dracula}
                                customStyle={{
                                  margin: '0.5rem 0',
                                  padding: '0.75rem',
                                  fontSize: '12px',
                                  borderRadius: '0.25rem'
                                }}
                              >
                                {`# Navigate to backend directory
cd backend
# Create virtual environment (recommended)
python -m venv venv
# Activate virtual environment
source venv/bin/activate  # On Windows: venv\\Scripts\\activate
# Install dependencies
pip install -r requirements.txt
# Start server
python app.py`}
                              </SyntaxHighlighter>
                            </li>
                          )}
                          
                          {technicalSolution.project_plan.tech_stack.database.length > 0 && (
                            <li>
                              <span className="font-medium">Database Setup:</span>
                              <p className="text-gray-300 mt-1">
                                Ensure your database is running and accessible with the configured connection details.
                              </p>
                            </li>
                          )}
                        </ol>
                      </div>
                      
                      {/* Usage Instructions */}
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Usage:</h4>
                        <ul className="list-disc pl-5 space-y-1 text-[13px]">
                          <li>
                            Open the application in your browser at <span className="font-mono bg-gray-900 px-1 rounded">http://localhost:3000</span> (frontend) and <span className="font-mono bg-gray-900 px-1 rounded">http://localhost:5000</span> (backend API).
                          </li>
                          <li>
                            The application displays "Hello World" on the main page and demonstrates the integration between the React frontend and Python backend.
                          </li>
                          <li>
                            To modify the application, edit the React components in the frontend directory or the API endpoints in the backend directory.
                          </li>
                        </ul>
                      </div>
                      
                      {/* Production Deployment Notes */}
                      <div className="space-y-2">
                        <h4 className="text-[13px] font-medium text-gray-300">Deployment:</h4>
                        <p className="text-[13px]">For production deployment:</p>
                        <ul className="list-disc pl-5 space-y-1 text-[13px]">
                          <li>Build the React app with <span className="font-mono bg-gray-900 px-1 rounded">npm run build</span></li>
                          <li>Serve the backend with a production WSGI server like Gunicorn</li>
                          <li>Consider using Docker for containerized deployment</li>
                          <li>Set up proper environment variables for production settings</li>
                        </ul>
                      </div>
                    </div>
                  }
                  isLoading={!technicalSolution}
                />
              )}
            </>
          ) : (
            // Original LeetCode Problem UI
            <>
              <ContentSection
                title="Problem Statement"
                content={
                  problemStatementData ? (
                    <div className="whitespace-pre-wrap">
                      {(problemStatementData as ProblemStatementData).problem_statement}
                    </div>
                  ) : (
                    "No problem statement available"
                  )
                }
                isLoading={!problemStatementData}
              />

              <ContentSection
                title="Solution Explanation"
                content={
                  <div>
                    {thoughtsData ? (
                      <div className="space-y-4">
                        {thoughtsData.map((thought, i) => (
                          <div
                            key={i}
                            className={`${
                              i === 0
                                ? ""
                                : "border-t border-gray-800 pt-4 mt-4"
                            }`}
                          >
                            {thought}
                          </div>
                        ))}
                      </div>
                    ) : (
                      "No explanation available"
                    )}
                  </div>
                }
                isLoading={!thoughtsData}
              />

              <ComplexitySection
                timeComplexity={timeComplexityData}
                spaceComplexity={spaceComplexityData}
                isLoading={!timeComplexityData || !spaceComplexityData}
              />

              <SolutionSection
                title="Solution"
                content={solutionData || "No solution available"}
                isLoading={!solutionData}
                language={solutionLanguage}
                onLanguageChange={handleLanguageChange}
              />
            </>
          )}

          {/* Queue for additional screenshots */}
          <div className="mt-4 space-y-4">
            <h2 className="text-[13px] font-medium text-white tracking-wide">
              Additional Screenshots (Optional)
            </h2>
            {debugProcessing ? (
              <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                Processing extra screenshots...
              </p>
            ) : (
              <div className="space-y-3">
                <ScreenshotQueue
                  isLoading={false}
                  screenshots={extraScreenshots}
                  onDeleteScreenshot={handleDeleteExtraScreenshot}
                />
                
                {extraScreenshots.length > 0 && (
                  <button
                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded"
                    onClick={() => {
                      // Try to process extra screenshots if available in the API
                      try {
                        // @ts-ignore - we're handling the case if the method doesn't exist
                        if (window.electronAPI.processExtraScreenshots) {
                          // @ts-ignore
                          window.electronAPI.processExtraScreenshots();
                          setDebugProcessing(true);
                        } else {
                          console.error("processExtraScreenshots method not available");
                          showToast(
                            "Feature Not Available",
                            "The processExtraScreenshots function is not available in this version.",
                            "error"
                          );
                        }
                      } catch (err) {
                        console.error("Error processing extra screenshots:", err);
                      }
                    }}
                  >
                    Process Additional Screenshots
                  </button>
                )}
                
                {extraScreenshots.length === 0 && (
                  <p className="text-xs text-gray-400">
                    Take additional screenshots to analyze more information.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Solutions

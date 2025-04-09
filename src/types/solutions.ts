export interface Solution {
  initial_thoughts: string[]
  thought_steps: string[]
  description: string
  code: string
}

export interface SolutionsResponse {
  [key: string]: Solution
}

// Base interface for both problem types
export interface BaseProblemData {
  type: 'leetcode_problem' | 'technical_requirement';
}

// Original LeetCode problem format
export interface ProblemStatementData extends BaseProblemData {
  type: 'leetcode_problem';
  problem_statement: string;
  input_format: {
    description: string;
    parameters: any[];
  };
  output_format: {
    description: string;
    type: string;
    subtype: string;
  };
  complexity: {
    time: string;
    space: string;
  };
  test_cases: any[];
  validation_type: string;
  difficulty: string;
}

// New technical requirement format
export interface TechnicalRequirementData extends BaseProblemData {
  type: 'technical_requirement';
  project_title: string;
  requirements_list: string[];
  tech_stack: string[];
  optional_features: string[];
}

// Union type for both problem types
export type ProblemData = ProblemStatementData | TechnicalRequirementData;

// Technical project solution structure
export interface ProjectPlan {
  overview: string;
  architecture: string;
  tech_stack: {
    frontend: string[];
    backend: string[];
    database: string[];
    deployment: string[];
  };
}

export interface ImplementationStep {
  step: string;
  details: string;
}

export interface FileStructure {
  path: string;
  purpose: string;
  code_sample: string;
}

export interface KeyFeature {
  feature: string;
  implementation: string;
}

export interface TechnicalSolution {
  project_plan: ProjectPlan;
  implementation_steps: ImplementationStep[];
  file_structure: FileStructure[];
  key_features: KeyFeature[];
}
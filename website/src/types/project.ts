export interface Project {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface ProjectsResponse {
  projects: Project[]
}

export interface ProjectResponse {
  project: Project
}

export interface CreateProjectPayload {
  name: string
  description: string
}

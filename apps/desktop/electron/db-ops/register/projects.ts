import { ipcMain } from 'electron'
import {
  deleteProject,
  getAllProjects,
  insertProject,
  type ProjectRow,
  updateProject,
} from '../projects'

export function registerProjectsHandlers() {
  ipcMain.handle('projects:getAll', () => getAllProjects())
  ipcMain.handle('projects:insert', (_event, project: ProjectRow) => insertProject(project))
  ipcMain.handle('projects:update', (_event, project: ProjectRow) => updateProject(project))
  ipcMain.handle('projects:delete', (_event, id: string) => deleteProject(id))
}

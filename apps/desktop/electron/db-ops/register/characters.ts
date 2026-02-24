import { ipcMain } from 'electron'
import {
  deleteCharacter,
  ensureCharactersSchema,
  getAllCharacters,
  getCharactersByProject,
  insertCharacter,
  replaceCharactersByProject,
  type CharacterRow,
  updateCharacter,
} from '../characters'

export function registerCharactersHandlers() {
  ensureCharactersSchema()

  ipcMain.handle('characters:getAll', () => getAllCharacters())
  ipcMain.handle('characters:getByProject', (_event, projectId: string) => getCharactersByProject(projectId))
  ipcMain.handle('characters:insert', (_event, character: CharacterRow) => insertCharacter(character))
  ipcMain.handle('characters:update', (_event, character: CharacterRow) => updateCharacter(character))
  ipcMain.handle('characters:replaceByProject', (_event, payload: { projectId: string; characters: CharacterRow[] }) => replaceCharactersByProject(payload))
  ipcMain.handle('characters:delete', (_event, id: string) => deleteCharacter(id))
}

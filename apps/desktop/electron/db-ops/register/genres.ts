import { ipcMain } from 'electron'
import {
  deleteCategory,
  deleteGenre,
  getAllCategories,
  getAllGenres,
  insertCategory,
  insertGenre,
  type CategoryRow,
  type GenreRow,
  updateCategory,
  updateGenre,
} from '../genres'

export function registerGenresHandlers() {
  ipcMain.handle('genres:getAll', () => getAllGenres())
  ipcMain.handle('genres:insert', (_event, genre: GenreRow) => insertGenre(genre))
  ipcMain.handle('genres:update', (_event, genre: GenreRow) => updateGenre(genre))
  ipcMain.handle('genres:delete', (_event, id: string) => deleteGenre(id))

  ipcMain.handle('categories:getAll', () => getAllCategories())
  ipcMain.handle('categories:insert', (_event, category: CategoryRow) => insertCategory(category))
  ipcMain.handle('categories:update', (_event, category: CategoryRow) => updateCategory(category))
  ipcMain.handle('categories:delete', (_event, id: string) => deleteCategory(id))
}

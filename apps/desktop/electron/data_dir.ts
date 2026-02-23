import { app } from 'electron'
import { store } from './store'

export function getDataDir(): string {
  return store.get('data_dir') || app.getPath('userData')
}

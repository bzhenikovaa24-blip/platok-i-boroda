import * as path from 'path';

const root = process.env.GAME_ROOT || path.resolve(__dirname, '..', '..');

export const paths = {
  root,
  client: path.join(root, 'client'),
  levelsFile: process.env.LEVELS_FILE || path.join(root, 'shared', 'levels.json'),
  dbFile: process.env.DB_FILE || path.join(root, 'data', 'game.db'),
};

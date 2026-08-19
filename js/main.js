import { renderSetup } from './screens/setup.js';
import { renderSchedule } from './screens/schedule.js';
import { createGame, save, load, clearSave } from './state.js';

const app = document.getElementById('app');

function start() {
  const saved = load();
  if (saved) {
    renderSchedule(app, saved, reset);
    return;
  }
  renderSetup(app, (input) => {
    const game = createGame(input);
    save(game);
    renderSchedule(app, game, reset);
  });
}

function reset() {
  clearSave();
  start();
}

start();

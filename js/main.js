import { renderSetup } from './screens/setup.js';
import { renderTeam } from './screens/team.js';
import { createGame, save, load, clearSave } from './state.js';

const app = document.getElementById('app');

function start() {
  const saved = load();
  if (saved) {
    renderTeam(app, saved, reset);
    return;
  }
  renderSetup(app, (input) => {
    const game = createGame(input);
    save(game);
    renderTeam(app, game, reset);
  });
}

function reset() {
  clearSave();
  start();
}

start();

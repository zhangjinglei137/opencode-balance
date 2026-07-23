function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = {
  info(msg) { console.log(`[${ts()}] [INFO] ${msg}`); },
  warn(msg) { console.warn(`[${ts()}] [WARN] ${msg}`); },
  error(msg) { console.error(`[${ts()}] [ERROR] ${msg}`); },
};
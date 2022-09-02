class PrintTable {
  #list = {};
  #header: string;

  constructor(_header) {
    this.#header = _header;
  }
  async add(key, promise) {
    let value = await promise;
    this.#list[key] = { [this.#header]: value.toString() };
  }
  log() {
    console.table(this.#list);
  }
}

export { PrintTable };

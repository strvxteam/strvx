import neo4j, { type Driver, type ManagedTransaction, type Session } from "neo4j-driver";

export interface Neo4jClientOptions {
  uri: string;
  rw: { user: string; password: string };
  ro: { user: string; password: string };
  database?: string; // default 'neo4j'
}

export interface Neo4jClient {
  read<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T>;
  unsafeWrite<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T>;
  unsafeRawSession(mode: "read" | "write"): Session;
  close(): Promise<void>;
}

export function createNeo4jClient(opts: Neo4jClientOptions): Neo4jClient {
  const database = opts.database ?? "neo4j";
  const rwDriver: Driver = neo4j.driver(
    opts.uri,
    neo4j.auth.basic(opts.rw.user, opts.rw.password),
    { disableLosslessIntegers: true },
  );
  const roDriver: Driver = neo4j.driver(
    opts.uri,
    neo4j.auth.basic(opts.ro.user, opts.ro.password),
    { disableLosslessIntegers: true },
  );

  function read<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    const session = roDriver.session({ database, defaultAccessMode: neo4j.session.READ });
    return session.executeRead(work).finally(() => session.close());
  }

  function unsafeWrite<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    const session = rwDriver.session({ database, defaultAccessMode: neo4j.session.WRITE });
    return session.executeWrite(work).finally(() => session.close());
  }

  function unsafeRawSession(mode: "read" | "write"): Session {
    const driver = mode === "read" ? roDriver : rwDriver;
    return driver.session({
      database,
      defaultAccessMode: mode === "read" ? neo4j.session.READ : neo4j.session.WRITE,
    });
  }

  async function close(): Promise<void> {
    await Promise.all([rwDriver.close(), roDriver.close()]);
  }

  return { read, unsafeWrite, unsafeRawSession, close };
}

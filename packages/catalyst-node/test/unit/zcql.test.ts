import { describe, expect, it, vi } from "vitest";
import { Zcql, type ZcqlRow } from "@/zcql";
import { CatalystScope } from "@/catalyst-scope";
import { ErrorCode } from "@/error-codes";
import { CatalystError } from "@/catalyst-error";
import { inRequest } from "../in-request";

// The SDK is replaced before zcql.ts loads it, so no call leaves the process. vi.hoisted
// makes the spy exist by then, since vi.mock is hoisted above the imports.
const { executeZcqlQuery } = vi.hoisted(() => ({ executeZcqlQuery: vi.fn() }));

vi.mock("@zcatalyst/datastore", () => ({
  Datastore: class {
    executeZCQLQuery = executeZcqlQuery;
  },
}));

/** Runs the query the way a route would, inside the request's execution context. */
function queryAsUser(query: string): Promise<ZcqlRow[]> {
  return inRequest(() => Zcql.runIn(CatalystScope.User).executeQuery(query));
}

describe("Zcql.executeQuery", () => {
  it("sends the statement as written and keeps each table's columns under its name", async () => {
    const joinedRows = [{ Todo: { ROWID: "1", TITLE: "Pay" }, Owner: { ROWID: "9" } }];
    executeZcqlQuery.mockResolvedValue(joinedRows);

    const storedRows = await queryAsUser("SELECT * FROM Todo JOIN Owner");

    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith("SELECT * FROM Todo JOIN Owner");
    expect(storedRows).toEqual(joinedRows);
  });

  it("turns an SDK failure into a CatalystError", async () => {
    executeZcqlQuery.mockRejectedValue(new Error("ZCQL syntax error"));

    const querying = queryAsUser("SELEC * FROM Todo");

    await expect(querying).rejects.toBeInstanceOf(CatalystError);
    await expect(querying).rejects.toMatchObject({ code: ErrorCode.INVALID_RESOURCE });
  });
});

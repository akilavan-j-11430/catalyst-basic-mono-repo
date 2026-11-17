import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { UserManagement } from "@repo/catalyst-node/user-management";
import { catalystSessionOf, initCatalystScopes } from "@repo/http-server/middleware";
import { toRecordResponse } from "@repo/http-server/response";

export const meRouter: Router = Router();

meRouter.get(ApiPath.Me, initCatalystScopes([CatalystScope.User]), async (_req, res) => {
  res.json(toRecordResponse(await UserManagement.currentUser(catalystSessionOf(res))));
});

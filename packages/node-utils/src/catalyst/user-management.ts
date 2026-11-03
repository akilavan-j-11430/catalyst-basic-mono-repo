import { UserManagement as UserManagementClient } from "@zcatalyst/auth";
import { CamelCase } from "@repo/case-conversion/camel-case";
import { CatalystScope } from "@/enums/catalyst-scope";
import { CatalystError } from "@/errors/catalyst-error";
import { currentContext } from "@/framework/async-context";

/** The signed-in caller, as this repo names them. */
export interface AppUser {
  userId: string;
  emailId: string;
}

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. User scope, because the question
 *  is who the caller is - an admin app would answer with the project admin instead. */
function userManagement(): UserManagementClient {
  return new UserManagementClient(
    currentContext().manager.catalyst.getApp(CatalystScope.User),
  );
}

/** Catalyst app users. Like `Zcql`, this names no resource, so it has no handle. */
export class UserManagement {
  /** The user whose session made this request. Picks only the fields we expose, so the
   *  rest of Catalyst's user record never leaks. */
  static async currentUser(): Promise<AppUser> {
    try {
      const { userId, emailId } = CamelCase.convertKeys(await userManagement().getCurrentUser());
      return { userId: String(userId), emailId };
    } catch (cause) {
      throw CatalystError.InvalidResource("Failed to read the signed-in user", cause);
    }
  }
}

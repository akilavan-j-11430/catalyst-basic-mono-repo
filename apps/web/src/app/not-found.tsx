import { AppFooter, AppHeader } from "@/components/shared/app-frame";
import { NotFoundState } from "@/components/shared/not-found-state";
import { ThemeSwitch } from "@/components/shared/theme-switch";

/** Any URL the app has no page for. Outside the sign-in gate, so the header carries only
 *  the theme switch. */
export default function NotFound() {
  return (
    <>
      <AppHeader actions={<ThemeSwitch />} />
      <main className="flex flex-1 flex-col">
        <NotFoundState
          title="Nothing is answering here."
          detail="This page does not exist - the link may be old or mistyped."
        />
      </main>
      <AppFooter />
    </>
  );
}

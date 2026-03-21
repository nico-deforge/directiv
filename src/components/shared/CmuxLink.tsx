import { openDirectivLink } from "../../lib/cmuxLinks";
import { TERMINAL_EMULATORS, type TerminalEmulator } from "../../types";

interface CmuxLinkProps extends Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> {
  href: string;
  workspaceName: string | null;
  terminal: TerminalEmulator;
  children: React.ReactNode;
}

/**
 * Drop-in replacement for `<a href target="_blank">`.
 *
 * When the terminal backend is cmux and a workspace name is provided,
 * clicking the link opens the URL in the cmux browser pane of that workspace.
 * Otherwise renders a standard anchor element.
 */
export function CmuxLink({
  href,
  workspaceName,
  terminal,
  children,
  onClick,
  ...rest
}: CmuxLinkProps) {
  const isCmux = terminal === TERMINAL_EMULATORS.CMUX;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;

    if (isCmux && workspaceName) {
      e.preventDefault();
      openDirectivLink(href, workspaceName, true);
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
}

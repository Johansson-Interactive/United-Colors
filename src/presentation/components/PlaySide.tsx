import { Group } from "@shopify/react-native-skia";
import type React from "react";
import type { PortalCut } from "../hooks/useStageLook";

interface PlaySideProps {
	/** How to cut it while the pause world is under the play side; null in play */
	cut: PortalCut | null;
	children: React.ReactNode;
}

/**
 * A part of the play side drawn inside a Skia canvas (see GLOSSARY.md: Portal): cut over the
 * pause world (see useStageLook), so only the part the portal leaves to play shows over the
 * pause, and not cut at all in play, which pays for no clip. The same tree either way, so
 * starting or stopping the cut remounts nothing.
 */
export const PlaySide: React.FC<PlaySideProps> = ({ cut, children }) => (
	<Group clip={cut?.clip} invertClip={cut?.out}>
		{children}
	</Group>
);

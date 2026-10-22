import { Group, type SkRRect } from "@shopify/react-native-skia";
import type React from "react";
import type { SharedValue } from "react-native-reanimated";

/** How the play side is cut to the portal (see useStageLook): its circle, and which side shows */
export interface PortalCut {
	clip: SharedValue<SkRRect>;
	/** The play side shows outside the circle (the bloom, or play all over), not inside it */
	out: SharedValue<boolean>;
}

interface PlaySideProps {
	/** The portal to cut to while the pause world is under the play side; none in play */
	cut: PortalCut | null;
	children: React.ReactNode;
}

/**
 * A part of the play side drawn inside a Skia canvas (see GLOSSARY.md: Portal): cut to the
 * portal while the pause world is under it, so only the part the portal leaves to play shows
 * over the pause, and not cut at all in play, which pays for no clip. The same tree either way,
 * so starting or stopping the cut remounts nothing.
 */
export const PlaySide: React.FC<PlaySideProps> = ({ cut, children }) => (
	<Group clip={cut?.clip} invertClip={cut?.out}>
		{children}
	</Group>
);

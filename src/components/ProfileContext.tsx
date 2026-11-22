import {createContext, useContext} from 'react';

export interface ProfileInfo {
	name: string;
	/** Several profiles on this TV: worth showing whose session this is. */
	shared: boolean;
	onOpen: () => void;
}

export const ProfileContext = createContext<ProfileInfo | null>(null);

export function useProfileInfo (): ProfileInfo | null {
	return useContext(ProfileContext);
}

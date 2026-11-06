/// <reference types="@unplugin-pwa/core/client" />
/// <reference types="@unplugin-pwa/core/info" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	/** Injected by vite.config.ts — package.json's version. */
	const __APP_VERSION__: string;
}

export {};

<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';
	import UpdateNotice from '$lib/components/UpdateNotice.svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { initPwa } from '$lib/stores/pwa.svelte.js';
	import { getPages } from '$lib/stores/app.svelte.js';

	let { children } = $props();

	// Dismiss the static-shell boot loader (app.html) once the app is mounted
	// and interactive. Fade out, then remove; a timeout backstops the case
	// where transitionend never fires (reduced motion zeroes the duration).
	onMount(() => {
		void initPwa(() => getPages().length > 0);
		const el = document.getElementById('boot-loader');
		if (!el) return;
		el.classList.add('is-done');
		const drop = () => el.remove();
		el.addEventListener('transitionend', drop, { once: true });
		setTimeout(drop, 600);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- Absent in dev, where the PWA plugin is disabled and serves no manifest. -->
	{#if pwaInfo}
		<link rel="manifest" href={pwaInfo.webManifest.href} />
	{/if}
</svelte:head>

{@render children()}
<KeyboardHelp />
<UpdateNotice />

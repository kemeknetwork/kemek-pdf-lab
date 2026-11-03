<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';
	import UpdateNotice from '$lib/components/UpdateNotice.svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { initPwa } from '$lib/stores/pwa.svelte.js';
	import { getDocuments, getUndoStack } from '$lib/stores/app.svelte.js';

	let { children } = $props();

	// What a silent update reload would destroy. Documents, not pages: deleting
	// every page leaves the work undoable. An open modal means the user is
	// mid-task, e.g. a password prompt for a file still being ingested.
	const hasOpenWork = () =>
		getDocuments().length > 0 ||
		getUndoStack().length > 0 ||
		document.querySelector('[aria-modal="true"]') !== null;

	// Dismiss the static-shell boot loader (app.html) once the app is mounted
	// and interactive. Fade out, then remove; a timeout backstops the case
	// where transitionend never fires (reduced motion zeroes the duration).
	onMount(() => {
		void initPwa(hasOpenWork);
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

<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';

	let { children } = $props();

	// Dismiss the static-shell boot loader (app.html) once the app is mounted
	// and interactive. Fade out, then remove; a timeout backstops the case
	// where transitionend never fires (reduced motion zeroes the duration).
	onMount(() => {
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
</svelte:head>

{@render children()}
<KeyboardHelp />

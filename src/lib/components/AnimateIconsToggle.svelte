<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import { themeStore } from '$lib/stores/theme';
	import { authStore } from '$lib/stores/auth';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		userId?: number; // omit for global default (login page / auth-disabled)
	}

	let { userId }: Props = $props();

	// Same "skip applying" rule as ThemeSelector: don't toggle the live document
	// when the admin is editing the global default while logged in (their own
	// per-user preference still drives their session).
	const skipApply = $derived($authStore.loading ? true : ($authStore.authEnabled && !userId));

	let checked = $state(true);
	$effect(() => {
		checked = $themeStore.animateIcons;
	});

	function onToggle(value: boolean) {
		checked = value;
		themeStore.setPreference('animateIcons', value, userId, skipApply);
		toast.success(value ? m.toast_setting_enabled() : m.toast_setting_disabled());
	}
</script>

<div class="space-y-1">
	<div class="flex items-center gap-3">
		<Label>{m.appearance_animate_icons()}</Label>
		<TogglePill {checked} onchange={onToggle} />
	</div>
	<p class="text-xs text-muted-foreground">{m.appearance_animate_icons_desc()}</p>
</div>

<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Activity } from 'lucide-svelte';

	interface Props {
		today: number;
		total: number;
	}

	let { today, total }: Props = $props();
</script>

{#if total > 0}
	<div class="flex items-center justify-between text-xs pt-1 border-t border-border/50">
		<span class="flex items-center gap-1 text-muted-foreground">
			<Activity class="w-3 h-3" /> {m.dashboard_events()}
		</span>
		<span class="font-medium">
			{m.dashboard_count_today({ count: today })} <span class="text-muted-foreground">/ {m.settings_env_total({ count: total })}</span>
		</span>
	</div>
{/if}

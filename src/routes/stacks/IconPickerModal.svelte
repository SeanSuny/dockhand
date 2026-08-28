<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { stackIconMap, getStackIconComponent } from '$lib/utils/icons';
	import * as m from '$lib/paraglide/messages';
	import { Upload, Search, Loader2, ExternalLink, ImageOff } from 'lucide-svelte';
	import AvatarCropper from '$lib/components/AvatarCropper.svelte';

	interface Props {
		open: boolean;
		/** Current icon value (lucide name / selfhst:<ref> / custom:...). */
		value?: string | null;
		/** Called with the chosen value string, or '' to clear. */
		onselect: (icon: string) => void;
		/** Dialog heading - defaults to a generic label; callers can scope it. */
		title?: string;
	}

	let { open = $bindable(false), value = null, onselect, title = m.stacks_icon_title() }: Props = $props();

	// --- Lucide tab ---
	const lucideNames = Object.keys(stackIconMap);
	let lucideQuery = $state('');
	const filteredLucide = $derived(
		lucideQuery.trim()
			? lucideNames.filter((n) => n.includes(lucideQuery.trim().toLowerCase()))
			: lucideNames
	);

	function pickLucide(name: string) {
		onselect(name);
		open = false;
	}

	// --- selfh.st tab (lazy) ---
	interface SelfhstEntry { Name: string; Reference: string; SVG: string }
	let manifest = $state<SelfhstEntry[]>([]);
	let manifestLoading = $state(false);
	let manifestError = $state('');
	let selfhstQuery = $state('');

	async function loadManifest() {
		if (manifest.length || manifestLoading) return;
		manifestLoading = true;
		manifestError = '';
		try {
			const res = await fetch('/api/icons/selfhst-manifest');
			if (!res.ok) throw new Error(`manifest ${res.status}`);
			const all = (await res.json()) as SelfhstEntry[];
			// Only SVG-capable entries (that's what our proxy serves).
			manifest = all.filter((e) => e.SVG === 'Yes' && e.Reference);
		} catch (e) {
			manifestError = m.stacks_icon_load_error();
		} finally {
			manifestLoading = false;
		}
	}

	// Cap the rendered result count so a blank query doesn't try to lazy-load 2800 icons.
	const selfhstResults = $derived(
		(selfhstQuery.trim()
			? manifest.filter(
					(e) =>
						e.Name.toLowerCase().includes(selfhstQuery.trim().toLowerCase()) ||
						e.Reference.includes(selfhstQuery.trim().toLowerCase())
				)
			: manifest
		).slice(0, 120)
	);

	// ref -> data: URI for the currently-shown grid. The icons are fetched in ONE
	// batch request instead of one <img> request per ref, so a WAF (CrowdSec) doesn't
	// see the grid as crawling and block the client (#1467).
	let iconData = $state<Record<string, string>>({});
	let iconsLoading = $state(false);
	let batchSeq = 0;
	// Refs already asked for (resolved OR omitted-as-unresolvable). We key `missing`
	// off THIS, not off iconData, so a ref the batch omits still counts as attempted
	// and never gets requested again - otherwise the effect (which reads+writes
	// iconData) would re-fire forever, POSTing the same unresolvable refs in a loop.
	// It is intentionally a plain Set (non-reactive), so mutating it doesn't retrigger.
	const attempted = new Set<string>();
	$effect(() => {
		const refs = selfhstResults.map((e) => e.Reference);
		if (refs.length === 0) return;
		const missing = refs.filter((r) => !attempted.has(r));
		if (missing.length === 0) return;
		for (const r of missing) attempted.add(r);
		const seq = ++batchSeq;
		iconsLoading = true;
		fetch('/api/icons/selfhst/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ refs: missing })
		})
			.then((r) => (r.ok ? r.json() : { icons: {} }))
			.then((data: { icons?: Record<string, string> }) => {
				const icons = data.icons ?? {};
				if (Object.keys(icons).length > 0) iconData = { ...iconData, ...icons };
			})
			.catch(() => {
				/* leave unresolved refs as placeholder tiles */
			})
			.finally(() => {
				if (seq === batchSeq) iconsLoading = false;
			});
	});

	// The first batch is still in flight and no icon has resolved yet -> show a spinner
	// instead of a grid of empty pulse tiles.
	const showIconSpinner = $derived(iconsLoading && Object.keys(iconData).length === 0);

	function pickSelfhst(ref: string) {
		onselect(`selfhst:${ref}`);
		open = false;
	}

	function onTabChange(v: string) {
		if (v === 'selfhst') loadManifest();
	}

	// --- Upload tab (crop like env icons) ---
	let iconCropperImageUrl = $state('');
	let showIconCropper = $state(false);

	function onFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			iconCropperImageUrl = reader.result as string;
			input.value = '';
			showIconCropper = true;
		};
		reader.readAsDataURL(file);
	}

	// The cropped 128px webp data URL goes to the parent, which owns the stack name
	// and POSTs it (same flow env icons use).
	function handleIconCropSave(dataUrl: string) {
		showIconCropper = false;
		onselect(`upload:${dataUrl}`);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-2xl h-[640px] flex flex-col">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>

		<Tabs.Root value="icons" onValueChange={onTabChange} class="flex-1 flex flex-col min-h-0">
			<Tabs.List class="grid grid-cols-3 shrink-0">
				<Tabs.Trigger value="icons">{m.stacks_icon_tab_icons()}</Tabs.Trigger>
				<Tabs.Trigger value="selfhst">{m.stacks_icon_tab_logos()}</Tabs.Trigger>
				<Tabs.Trigger value="upload">{m.stacks_icon_tab_upload()}</Tabs.Trigger>
			</Tabs.List>

			<!-- Lucide icons -->
			<Tabs.Content value="icons" class="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col">
				<div class="relative mb-3 shrink-0">
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input bind:value={lucideQuery} placeholder={m.stacks_icon_search_icons()} class="pl-8" />
				</div>
				<div class="grid grid-cols-12 gap-1 flex-1 overflow-y-auto pr-1 content-start">
					{#each filteredLucide as name (name)}
						{@const Icon = getStackIconComponent(name)}
						<button
							type="button"
							title={name}
							onclick={() => pickLucide(name)}
							class="flex items-center justify-center aspect-square rounded-md border hover:bg-accent hover:border-primary transition-colors {value === name ? 'border-primary bg-accent' : 'border-transparent'}"
						>
							<Icon class="w-4 h-4" />
						</button>
					{/each}
				</div>
			</Tabs.Content>

			<!-- selfh.st app logos -->
			<Tabs.Content value="selfhst" class="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col">
				<div class="relative mb-3 shrink-0">
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input bind:value={selfhstQuery} placeholder={m.stacks_icon_search_logos()} class="pl-8" />
				</div>
				<div class="flex-1 min-h-0 overflow-y-auto pr-1">
					{#if manifestLoading}
						<div class="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
							<Loader2 class="w-4 h-4 animate-spin" />{m.stacks_icon_loading_list()}
						</div>
					{:else if manifestError}
						<div class="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
							<ImageOff class="w-6 h-6" />
							<span class="text-center max-w-sm">{manifestError}</span>
						</div>
					{:else}
						{#if showIconSpinner}
							<div class="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
								<Loader2 class="w-4 h-4 animate-spin" />{m.stacks_icon_loading_icons()}
							</div>
						{/if}
						<div class="grid grid-cols-12 gap-1 content-start" class:hidden={showIconSpinner}>
							{#each selfhstResults as entry (entry.Reference)}
								<button
									type="button"
									title={entry.Name}
									onclick={() => pickSelfhst(entry.Reference)}
									class="flex items-center justify-center aspect-square rounded-md border p-1 hover:bg-accent hover:border-primary transition-colors {value === `selfhst:${entry.Reference}` ? 'border-primary bg-accent' : 'border-transparent'}"
								>
									{#if iconData[entry.Reference]}
										<img src={iconData[entry.Reference]} alt={entry.Name} class="w-full h-full object-contain" />
									{:else}
										<div class="w-full h-full rounded bg-muted animate-pulse" aria-label={entry.Name}></div>
									{/if}
								</button>
							{/each}
						</div>
						{#if selfhstResults.length === 0 && selfhstQuery.trim()}
							<p class="py-8 text-center text-sm text-muted-foreground">{m.stacks_icon_no_logos({ query: selfhstQuery })}</p>
						{/if}
					{/if}
				</div>
				<p class="mt-3 shrink-0 text-[11px] text-muted-foreground leading-relaxed">
					{@html m.stacks_icon_attribution()}
				</p>
				<p class="mt-1 text-[11px] text-muted-foreground leading-relaxed">
					{@html m.stacks_icon_legal()}
				</p>
			</Tabs.Content>

			<!-- Upload -->
			<Tabs.Content value="upload" class="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col justify-center gap-3">
				<label class="flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
					<Upload class="w-6 h-6 text-muted-foreground" />
					<span class="text-sm text-muted-foreground">{m.stacks_icon_upload_label()}</span>
					<span class="text-xs text-muted-foreground">{m.stacks_icon_upload_formats()}</span>
					<input type="file" accept="image/*" class="hidden" onchange={onFileSelect} />
				</label>
			</Tabs.Content>
		</Tabs.Root>

		<Dialog.Footer>
			{#if value}
				<Button variant="ghost" onclick={() => { onselect(''); open = false; }}>{m.stacks_icon_clear()}</Button>
			{/if}
		</Dialog.Footer>

		<AvatarCropper
			show={showIconCropper}
			imageUrl={iconCropperImageUrl}
			cropShape="round"
			outputSize={128}
			outputFormat="image/webp"
			outputQuality={0.85}
			title={m.settings_env_modal_crop_icon()}
			saveLabel={m.settings_env_modal_save_icon()}
			onCancel={() => (showIconCropper = false)}
			onSave={handleIconCropSave}
		/>
	</Dialog.Content>
</Dialog.Root>

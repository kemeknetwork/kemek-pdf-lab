<!--
  ProgressBar — modal overlay shown during PDF export.

  Displays a centered card with a spinner, label, fill bar, and percentage.
  The overlay blocks interaction until the export completes.

  @prop progress — 0–100 percentage value.
  @prop label — text above the bar (defaults to "Exporting...").
-->
<script lang="ts">
  interface Props {
    progress: number;
    label?: string;
  }

  let { progress, label = 'Exporting...' }: Props = $props();
</script>

<div class="progress-overlay">
  <div class="progress-card">
    <div class="progress-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
    </div>
    <p class="progress-label">{label}</p>
    <div class="progress-track">
      <div class="progress-fill" style:width="{Math.min(100, Math.max(0, progress))}%"></div>
    </div>
    <p class="progress-percent">{Math.round(progress)}%</p>
  </div>
</div>

<style>
  .progress-overlay {
    position: fixed;
    inset: 0;
    background: var(--pdf-lab-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .progress-card {
    background: var(--pdf-lab-surface);
    border-radius: 12px;
    padding: 2rem 2.5rem;
    min-width: 300px;
    box-shadow: var(--pdf-lab-shadow-lg);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .progress-icon {
    color: var(--pdf-lab-primary);
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .progress-label {
    margin: 0;
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--pdf-lab-text);
  }

  .progress-track {
    width: 100%;
    height: 6px;
    background: var(--pdf-lab-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--pdf-lab-primary);
    border-radius: 3px;
    transition: width 0.25s ease;
  }

  .progress-percent {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--pdf-lab-text-secondary);
    font-variant-numeric: tabular-nums;
  }
</style>

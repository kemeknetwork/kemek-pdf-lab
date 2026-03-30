<script lang="ts">
  interface Props {
    progress: number; // 0-100
    label?: string;
  }

  let { progress, label = 'Exporting...' }: Props = $props();
</script>

<div class="progress-overlay">
  <div class="progress-card">
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
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .progress-card {
    background: var(--pdf-lab-surface);
    border-radius: 12px;
    padding: 2rem;
    min-width: 320px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    text-align: center;
  }

  .progress-label {
    margin: 0 0 1rem;
    font-weight: 500;
    color: var(--pdf-lab-text);
  }

  .progress-track {
    width: 100%;
    height: 8px;
    background: var(--pdf-lab-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--pdf-lab-primary);
    border-radius: 4px;
    transition: width 0.2s ease;
  }

  .progress-percent {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--pdf-lab-text-secondary);
  }
</style>

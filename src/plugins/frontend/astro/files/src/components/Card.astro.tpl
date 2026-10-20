---
interface Props {
  title: string
}

const { title } = Astro.props
---

<section class="card">
  <h2>{title}</h2>
  <p><slot /></p>
</section>

<style>
  .card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
  }
</style>

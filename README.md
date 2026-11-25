# PCA plane explorer

A small teaching application for the ACNEI neural-manifolds workshop. It uses deterministic synthetic points in three arbitrary measurement units, with two main latent directions and adjustable variation normal to their plane. These are not experimental recordings or firing rates in Hz.

The interface separates rotating the camera from changing the data or projecting them. Its five stages cover the measured cloud, mean subtraction, principal axes, orthogonal projection, and the two-dimensional score plot. The mean-centered sample covariance is decomposed by a three-dimensional symmetric Jacobi eigensolver in `dist/pca-math.js`.

## Local use

No package installation or network dependency is needed. From this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8000/ . Keep that terminal running while using the app; stop it with Ctrl+C. If port 8000 is already occupied, use 8001 in the command and URL. Serve the app over HTTP because it uses JavaScript modules.

## Numerical checks

```sh
node --test tests/pca-math.test.mjs
```

The tests use small fixed datasets and verify rank-two recovery, orthonormal eigenvectors, variance ordering, translation/rotation invariance, deterministic sampling, zero/isotropic covariance, invalid inputs and reconstruction error. They were written before the numerical module and first failed because it was absent.

Covariance uses denominator n−1. The reconstruction error is the average squared Euclidean residual over observations, using denominator n. Thus retaining k components gives

`MSE = (n−1)/n × sum of discarded covariance eigenvalues`.

The display axes do not identify biological mechanisms. A small third component represents synthetic thickness in this example; a low-variance component in experimental data can still carry meaningful information. Equal eigenvalues permit multiple equally valid principal-axis orientations. The generated sample is elongated to avoid that ambiguity in the primary demonstration.

## Teaching connection

The three measured variables are a small analogue of the IBL analysis's 58 neuron columns. Each row remains one multivariate population observation. The final two scores correspond to the PC1/PC2 coordinates used for the IBL trajectories. Both choices need the same fitted projection for comparison. Explained variance is distinct from decoder accuracy.

References: [Cunningham & Yu (2014)](https://www.nature.com/articles/nn.3776) and [PCA mathematical description](https://scikit-learn.org/stable/modules/decomposition.html#pca).

## Publish on GitHub Pages

This folder is a standalone copy, without the original Git history or Sites hosting configuration. The application files and numerical tests are unchanged. No Git repository has been initialized here as part of this preparation.

Use a project repository named `pca-explorer` under your personal GitHub account. Its default Pages URL will be `https://YOUR_USERNAME.github.io/pca-explorer/`. This lets the app coexist with an existing profile website. Replace `YOUR_USERNAME` below with your GitHub username.

1. On GitHub, create an empty public repository called `pca-explorer`. Leave the README, license and gitignore options unselected because the local folder already contains files. Public repositories support Pages on GitHub Free.
2. Initialize and push from this folder:

   ```sh
   cd /Users/pranavrai/Work/int-brain-lab/projects/Outreach/pca-explorer
   git init
   git branch -M main
   git add .
   git commit -m "Add interactive PCA explorer"
   git remote add origin https://github.com/YOUR_USERNAME/pca-explorer.git
   git push -u origin main
   ```

3. In the GitHub repository, open **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**.
4. Open **Actions → Deploy PCA explorer to GitHub Pages → Run workflow**, choose `main`, and run it. This starts deployment after Pages is enabled, even if the first push ran before the setting was configured.
5. Wait for the workflow to succeed. Open **Settings → Pages → Visit site** for the exact published URL. The first publication can take several minutes.

The workflow in `.github/workflows/pages.yml` runs the numerical tests and uploads the contents of `dist/` directly. There is no package installation or compilation step. Relative asset URLs support the `/pca-explorer/` subpath. Pushes to `main` deploy later updates automatically.

To update the app, edit the files in `dist/`, run `node --test tests/pca-math.test.mjs`, preview locally, then commit and push. Keep `dist/` tracked: it contains the maintained source files, rather than generated build output.

If you want to feature the app on your GitHub profile, add a link to the published URL in your profile README or repository description's Website field. A profile README alone does not host the interactive application.

Official instructions: [Creating a Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) and [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

# Hierarchical Bayesian fitting with hBayesDM (Ahn, Haines & Zhang, 2017).
# The .txt files written by task/ already use the hBayesDM dd column names
# (subjID, delay_later, amount_later, delay_sooner, amount_sooner, choice),
# with catch trials removed.
#
# install.packages("hBayesDM")
# Rscript fit_hbayesdm.R data/

library(hBayesDM)

args <- commandArgs(trailingOnly = TRUE)
data_dir <- if (length(args)) args[1] else "data"
files <- list.files(data_dir, pattern = "\\.txt$", full.names = TRUE)
dat <- do.call(rbind, lapply(files, function(f) {
  d <- read.delim(f)
  d[, c("subjID", "delay_later", "amount_later", "delay_sooner", "amount_sooner", "choice")]
}))
combined <- file.path(tempdir(), "ddt_all.txt")
write.table(dat, combined, sep = "\t", row.names = FALSE, quote = FALSE)

fits <- list(
  hyperbolic  = dd_hyperbolic(data = combined, niter = 4000, nwarmup = 1000, nchain = 4, ncore = 4),
  exponential = dd_exp(data = combined, niter = 4000, nwarmup = 1000, nchain = 4, ncore = 4),
  cs          = dd_cs(data = combined, niter = 4000, nwarmup = 1000, nchain = 4, ncore = 4)
)

# Check convergence (Rhat < 1.1) before interpreting anything.
for (m in names(fits)) {
  cat("\n==", m, "==\n")
  print(rhat(fits[[m]], less = 1.1))
}

# Model comparison by LOOIC (lower is better).
print(printFit(fits$hyperbolic, fits$exponential, fits$cs, ic = "looic"))

# Individual posterior means; log(k) is usually used in group comparisons.
est <- fits$hyperbolic$allIndPars
est$log_k <- log(est$k)
write.csv(est, "hbayesdm_hyperbolic_individual.csv", row.names = FALSE)
plot(fits$hyperbolic, type = "trace")

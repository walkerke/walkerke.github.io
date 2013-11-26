Title: Density gradient example
Date: 2013-11-13 16:00
Category: R
Tags: R, ggplot2
Author: Kyle Walker
Summary: Test page for Pelican

**R code example for density gradients**


```r
setwd("C:/Users/kylewalker/Documents/Research/Migration/July 2013/derived")

require(plyr)
```

```
## Loading required package: plyr
```

```r
require(reshape2)
```

```
## Loading required package: reshape2
```

```r
require(nlme)
```

```
## Loading required package: nlme
```

```
## Warning: package 'nlme' was built under R version 3.0.2
```

```r
require(ggplot2)
```

```
## Loading required package: ggplot2
```

```r

tracts <- read.csv("tract_distance.csv", header = TRUE)

tsub <- subset(tracts, select = c("namelsad10", "geoid10_1", "distance_f", "aland10", 
    "dp0010001"))

tsub <- rename(tsub, c(geoid10_1 = "metroid", distance_f = "distance", dp0010001 = "totalpop"))

tsub$areasqmi <- tsub$aland10/2589988

tsub$popdensity <- tsub$totalpop/tsub$areasqmi

tsub$lndensity <- log(tsub$popdensity)

tsub$distmiles <- tsub$distance/1609.34

ctsub <- na.omit(tsub)

ctsub <- subset(ctsub, (totalpop > 0 & aland10 > 0))

list1 <- lmList(lndensity ~ distmiles | metroid, data = ctsub)

distdf <- coef(list1, augFrame = TRUE)

write.csv(distdf, "dist_gradient.csv", row.names = TRUE, na = "")
```


**Now, have a look at the plots!**


```r



#### San Francisco Plot
sfo <- subset(ctsub, metroid == 41860, select = c("lndensity", "distmiles", 
    "popdensity"))
sf <- qplot(distmiles, lndensity, data = sfo)
sfsm <- sf + stat_smooth(method = "loess", size = 1.5)
sfsm
```

![plot of chunk unnamed-chunk-2](figure/unnamed-chunk-21.png) 

```r


### Portland Plot
pdx <- subset(ctsub, metroid == 38900, select = c("lndensity", "distmiles", 
    "popdensity"))
pplot <- qplot(distmiles, lndensity, data = pdx)
ppsmooth <- pplot + stat_smooth(method = "loess", size = 1.5)
ppsmooth
```

![plot of chunk unnamed-chunk-2](figure/unnamed-chunk-22.png) 



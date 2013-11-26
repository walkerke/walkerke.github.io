Title: Lab 1 example
Date: 2013-11-26 16:00
Category: GIS
Tags: GIS, urban
Author: Kyle Walker
Summary: Testing multiple pages

## Introduction

Welcome back!  This lab is designed to give you a refresher on working with ArcGIS and performing common GIS operations that you learned in your introductory course.  You'll be completing a fairly standard project using GIS in urban and business analysis in this lab: mapping population distributions in Tarrant County.  Such information can be valuable in urban and business environments for many reasons.  City planners might need to know where certain population groups live within a region in order to tailor service provision to particular neighborhoods; business analysts will want to know the demographic makeup of cities to design marketing strategies or locate new franchises.  

Your assignment, then, is fairly straightforward.  You are tasked with **creating a map of the distribution of the Asian population in Collin County**, using data from the 2010 Census.  As this assignment is intended as a review assignment, you won't be doing anything in this lab that you don't already know how to do from your introductory GIS course.  However, here's the catch: **you won't have guided instructions for the lab assignment**.  Instead, I'm going to give you a series of guidelines that I'd like you to consider while preparing your map.  


--- 

## Data guidelines

Data acquisition and preparation will be an important part of this assignment.  Here are a few things to consider as you prepare to produce your visualization.  

  1.  What data sources have you chosen?  Recall that the Census makes geographic data available [here](http://www.census.gov/cgi-bin/geo/shapefiles2013/main), and you can access tabular data from [American FactFinder](http://factfinder2.census.gov/faces/nav/jsf/pages/index.xhtml).  However, recall that there are other options for finding demographic data, such as [NHGIS](http://www.nhgis.org).  

  2.	What variables have you chosen?  How have you chosen to measure "Asian?"  

  3.	What scale of analysis are you using to aggregate your data?  Recall that Collin County contains a variety of Census geographies, including Census tract, block group, ZCTA, etc.  As we know that your chosen scale can make a huge difference in your data visualization, this is a very important decision.  

  4.	Be sure to take care to attend to the little things as well.  For example, are your variables of interest being imported in the right format (e.g. string vs. numeric)?  Are you choosing the correct key fields to merge your spatial and tabular data?  


---

## Visualization guidelines

Once you've cleaned and prepared your data for use in ArcMap, it is time to make decisions about how to best visualize the distribution of Asians in Collin County.  Consider the following questions as you create your map.   

  1. Are your spatial data in a projection appropriate for North Texas?  If not, you should re-project your data to minimize visual distortion.  
  
  2. What type of map have you decided to produce?  There are multiple ways to visualize population data on a map, including but not limited to choropleth, graduated symbol, and dot-density maps.  Remember that it is important to prepare your data correctly depending on the type of map you've chosen; whereas choropleth maps are more appropriate for visualizing rates or percentages, graduated symbol and dot-density maps should be used for visualizing count data.  
  
  3. What design choices have you made?  Recall the tips you've learned about appropriate color choices for statistical mapping and how other "visual variables" (size, shape, texture, orientation) can show variation in your map.  Does your map use appropriate visual cues?  
  
  4. Is your map layout appropriate?  What map elements (e.g. title, scale bar, legend, north arrow, etc.) are necessary for this map, and which ones do you not really need?  Are your various elements appropriately arranged and sized?  

---

## For submission

To receive full credit for Lab 1, please submit the following documents via the dropbox basket in Learning Studio no later than **Wednesday, January 29**: 

  1. Your map
  
  2. A short document (around one page) that discusses your data and design decisions.  You should address in this document: 
  
  --Your data sources
  
  --Scale and variable selection
  
  --Your cartographic design decisions

---

## Credits

This site was designed in [RStudio](http://www.rstudio.com) with [Slidify](http://slidify.org/) and styled with [Bootplus](http://aozora.github.io/bootplus/).  It owes heavily to the work of [Timely Portfolio](https://github.com/timelyportfolio).




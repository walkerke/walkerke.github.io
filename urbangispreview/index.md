---
title       : Urban & Business GIS Preview
subtitle    : January 13, 2014
author      : Kyle Walker
job         : Texas Christian University
framework   : bootplus        # {io2012, html5slides, shower, dzslides, ...}
layout      : post
highlighter : highlight.js  # {highlight.js, prettify, highlight}
hitheme     : tomorrow      # 
widgets     : []            # {mathjax, quiz, bootstrap}
mode        : selfcontained # {standalone, draft}
lead        : >
  GEOG 40323, Prof. Kyle Walker, Spring 2014
---

## What is Urban & Business GIS?

In this course, you will build upon the skills you learned in your introductory GIS course and gain experience with several more advanced applications of GIS software.  In particular, you'll learn how to use GIS to solve real-world problems in urban and business analysis.  You'll accomplish this through regular lab assignments, a simulated business GIS mini-project, and a group 
project in which you will use GIS to assist an actual client in the Fort Worth community.  Read through the following examples to get a sense of some of the things you'll be working on next semester if you take the course.  

--- 

## Market analysis and segmentation

In this module, you'll learn how companies use demographic and consumer data to make business decisions.  Tentatively, the director of GIS at [Buxton](http://www.buxtonco.com), a Fort Worth-headquartered business analytics company, will introduce you to the ways in which GIS is used in market research and consumer segmentation.  You'll then get to do business analytics yourselves using Esri's Business Analyst Online application (pictured below).  

<img src=assets/img/starbucks.jpg style="width: 650px;" />

---

## Network analysis

If you took Intro to GIS, you got a taste of network analysis; now, it's time to get your hands dirty modeling routes and doing drive-time analyses with road network data.  We'll be working with the Network Analyst extension in ArcGIS, which you'll use to build drive-time polygons (as in the image below), conduct closest facility analyses, and perform location-allocation modeling. 

<img src=assets/img/drivetime.png style="width: 650px;" />

---

## Web mapping

In the most recent issue of _ArcNews_, Esri declares that ["GIS is undergoing a profound transformation: It is becoming web GIS."](http://www.esri.com/esri-news/arcuser/fall-2013/transformation-and-opportunity)  While I believe that desktop GIS will continue to have a place given its ability to perform sophisticated analysis, the reality is that the visualization component of GIS is increasingly interactive and deployed over the web.  In business environments, interactive maps and visualizations are supplanting static graphics, as they allow decision-makers to actively engage with corporate data, rather than simply view it.  

Next semester, you'll gain experience deploying geospatial datasets to the cloud using hosting services like ArcGIS Online and CartoDB, and use these data to create custom web mapping applications.  You'll also learn the basics of the JavaScript programming language, which is the _lingua franca_ for interactive web-based visualization, to customize your web apps.  

In short, you'll get a sense of how to turn this (using the ArcGIS API for JavaScript): 

```javascript
    var map,
        webmapId = "a05e67060fb94384999f8b58dda29b16";
    
    require([
      "esri/map",
      "esri/arcgis/utils",
      "esri/dijit/Legend",
      "dojo/domReady!"
      ], function (Map, arcgisUtils, Legend) {
        arcgisUtils.createMap(webmapId, "mapDiv").then(function (response) {
        map = response.map     

        var legend = new Legend({
            map: map,
            layerInfos:(arcgisUtils.getLegendLayers(response))
        }, "legendDiv");
        
        legend.startup();
    });
    });
```
Into this (a map of contraceptive prevalence by country; click the countries for interactivity): 

<iframe width="775" height="550" src="http://personal.tcu.edu/kylewalker/js/wcp.html" frameborder="0" allowfullscreen></iframe>

---

## 3D city models with ArcGIS

Toward the end of the semester, you'll get the opportunity to learn more about creating three-dimensional models of cities using the modeling capabilities of ArcGIS's ArcScene and 3D Analyst extension. The City of Fort Worth incorporates this kind of modeling in their urban planning workflow, as seen in the image below [(read more in this article, the source of the image)](http://www.esri.com/news/arcnews/fall12articles/three-dimensional-spatial-analytics-and-modeling-is-now-sop-for-the-city-of-forth-worth-texas.html).  

<img src=assets/img/fw3d.jpg style="width: 650px;" />

---

## Course project

The centerpiece of the course is our semester project, in which you will work in groups to use GIS to assist a local organization.  I've lined up the following organizations as partners, with the potential for others if we get the enrollment: 

* [Fort Worth South, Inc.](http://www.fortworthsouth.org/)
* [Fort Worth Hispanic Chamber of Commerce](http://www.fwhcc.org/)
* [Tarrant Area Food Bank](http://www.tafb.org/)

You'll work directly with these organizations to provide GIS support to their initiatives.  They're all very excited to work with you; your work this semester will have a real impact for these organizations!  

---

## That's not all! 

These examples are just a sampling of the topics we'll be covering next semester.  Other topics will include: 

* Describing trends in your data with spatial statistics and exploratory spatial data analysis
* Interacting with databases and using SQL to process spatial data
* Analyzing urban growth and change from remotely sensed data
* Working with temporal data and creating animations in ArcGIS
* Preparing for the urban & business GIS job market

If you have any further questions, please don't hesitate to contact me at kyle.walker@tcu.edu.  I hope to see you next semester!

---

## Credits

This site was designed in [RStudio](http://www.rstudio.com) with [Slidify](http://slidify.org/) and styled with [Bootplus](http://aozora.github.io/bootplus/).  It owes heavily to the work of [Timely Portfolio](https://github.com/timelyportfolio).  






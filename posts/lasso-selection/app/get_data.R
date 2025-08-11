library(overtureR)
library(sf)
library(tigris)
library(tidyverse)
library(janitor)

# Get Austin city boundary  
austin <- core_based_statistical_areas(cb = TRUE) |> 
  filter(GEOID == "12420")

# Create search area
austin_bbox <- st_bbox(austin)

# Get coffee shops
austin_coffee <- open_curtain("place", austin_bbox) |>
  filter(
    str_detect(categories$primary, "coffee") | 
      str_detect(names$primary, "[Cc]offee")
  ) |>
  collect() 

austin_coffee$name <- austin_coffee$names$primary

austin_coffee$address <- sapply(austin_coffee$addresses, function(addr_df) {
  if(nrow(addr_df) > 0) {
    paste(addr_df$freeform, 
          paste0(addr_df$locality, ", ", addr_df$region, " ", addr_df$postcode),
          addr_df$country,
          sep = ", ")
  } else {
    NA_character_
  }
})

austin_coffee <- select(austin_coffee, name, address)
# Save for use in Shiny app
write_rds(austin_coffee, "austin_coffee.rds")

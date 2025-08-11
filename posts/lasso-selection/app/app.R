library(shiny)
library(mapgl)
library(ellmer)
library(shinychat)
library(bslib)

# Load coffee shop data
austin_coffee <- readRDS("austin_coffee.rds")

# Initialize Claude Sonnet
llm_chat <- NULL
if (nchar(Sys.getenv("ANTHROPIC_API_KEY")) > 0) {
  llm_chat <- chat_anthropic(
    model = "claude-sonnet-4-20250514",
    system_prompt = "You are a local business analyst. Provide brief, interesting insights about coffee shop locations and patterns. Keep responses concise and engaging."
  )
}

ui <- page_fluid(
  tags$head(
    tags$style(HTML(
      "
      body, .container-fluid {
        padding: 0;
        margin: 0;
      }
      .floating-panel {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 1000;
        background: rgba(255, 255, 255, 0.95);
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        width: 300px;
        max-height: 80vh;
        overflow-y: auto;
        backdrop-filter: blur(5px);
      }
      #map {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 100%;
      }
    "
    ))
  ),

  maplibreOutput("map", height = "100vh"),

  absolutePanel(
    class = "floating-panel",
    h5("Austin Coffee Lasso Selection"),
    p(
      "Draw a polygon to select coffee shops, then ask AI about them.",
      style = "font-size: 14px;"
    ),

    textOutput("count"),
    textOutput("sample_names"),

    conditionalPanel(
      condition = "output.ai_enabled && output.has_selection",
      br(),
      actionButton(
        "analyze",
        "Ask AI about selection",
        class = "btn-primary btn-sm",
        width = "100%"
      ),
      br(),
      br(),
      output_markdown_stream("ai_response")
    ),

    conditionalPanel(
      condition = "!output.ai_enabled",
      br(),
      p(
        "Set ANTHROPIC_API_KEY to enable AI analysis",
        style = "font-size: 12px; color: #666;"
      )
    )
  )
)

server <- function(input, output, session) {
  # Track current selection
  current_selection <- reactiveVal(list())

  output$map <- renderMaplibre({
    maplibre(
      style = maptiler_style("streets", variant = "light"),
      bounds = austin_coffee
    ) |>
      add_circle_layer(
        id = "coffee",
        source = austin_coffee,
        circle_color = "#8B4513",
        circle_radius = 6,
        circle_stroke_color = "white",
        circle_stroke_width = 1,
        tooltip = "name"
      ) |>
      add_draw_control(
        position = "top-right",
        freehand = TRUE
      )
  })

  # Track AI availability and selection status
  output$ai_enabled <- reactive({
    !is.null(llm_chat)
  })
  output$has_selection <- reactive({
    length(current_selection()) > 0
  })
  outputOptions(output, "ai_enabled", suspendWhenHidden = FALSE)
  outputOptions(output, "has_selection", suspendWhenHidden = FALSE)

  # Handle drawing events
  observeEvent(input$map_drawn_features, {
    drawn <- input$map_drawn_features

    if (!is.null(drawn)) {
      maplibre_proxy("map") |>
        clear_layer("highlights")

      Sys.sleep(0.2)

      maplibre_proxy("map") |>
        turf_filter(
          layer_id = "coffee",
          filter_layer_id = "gl-draw-polygon-fill.cold",
          predicate = "within",
          source_id = "selected",
          input_id = "results"
        )
    } else {
      current_selection(list())
      output$count <- renderText("")
      output$sample_names <- renderText("")

      maplibre_proxy("map") |>
        clear_layer("highlights")
    }
  })

  # Handle filter results
  observeEvent(input$map_turf_results, {
    result <- input$map_turf_results

    maplibre_proxy("map") |>
      clear_layer("highlights") |>
      add_circle_layer(
        id = "highlights",
        source = "selected",
        circle_color = "red",
        circle_radius = 10,
        circle_stroke_color = "white",
        circle_stroke_width = 2
      )

    if (!is.null(result$result$features)) {
      features <- result$result$features
      current_selection(features)

      shop_names <- sapply(features, function(f) f$properties$name)

      output$count <- renderText({
        paste("Selected", length(features), "coffee shops")
      })

      output$sample_names <- renderText({
        if (length(shop_names) > 0) {
          sample_size <- min(3, length(shop_names))
          paste0(
            "Sample: ",
            paste(head(shop_names, sample_size), collapse = ", ")
          )
        }
      })
    }
  })

  # Handle AI analysis button click
  observeEvent(input$analyze, {
    features <- current_selection()

    if (length(features) > 0 && !is.null(llm_chat)) {
      shop_names <- sapply(features, function(f) f$properties$name)

      # Create detailed prompt
      prompt <- paste0(
        "I've selected ",
        length(features),
        " coffee shops in Austin, Texas: ",
        paste(head(shop_names, 8), collapse = ", "),
        if (length(features) > 8)
          paste0(" and ", length(features) - 8, " others"),
        ". What insights can you provide about this area or these businesses? Are there any interesting patterns?"
      )

      # Stream the AI response
      stream <- llm_chat$stream_async(prompt)

      markdown_stream(
        id = "ai_response",
        content_stream = stream,
        operation = "replace"
      )
    }
  })
}

shinyApp(ui, server)

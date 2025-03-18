# rag-comparison-frontend/rag-comparison-frontend/README.md

# RAG Comparison Frontend

This project is a frontend application that allows users to interact with two different RAG (Retrieval-Augmented Generation) systems simultaneously. It provides a user-friendly interface to compare responses from a normal RAG agent and a Qdrant RAG agent.

## Features

- Two parallel chat boxes for interacting with both RAG systems.
- Real-time message streaming for a seamless chat experience.
- User-friendly interface with a clean design.

## Project Structure

```
rag-comparison-frontend
├── public
│   ├── index.html          # Main HTML file
│   └── favicon.ico         # Favicon for the application
├── src
│   ├── components          # React components for the application
│   ├── services            # API service for backend communication
│   ├── hooks               # Custom hooks for managing state
│   ├── context             # Context for user state management
│   ├── styles              # CSS styles for components
│   ├── App.jsx             # Main application component
│   ├── index.jsx           # Entry point for the React application
│   └── index.css           # Global styles
├── package.json            # NPM configuration file
├── .env                    # Environment variables
├── .gitignore              # Git ignore file
└── README.md               # Project documentation
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd rag-comparison-frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory and add your environment variables (e.g., API keys).

## Usage

1. Start the development server:
   ```
   npm start
   ```

2. Open your browser and navigate to `http://localhost:3000` to view the application.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
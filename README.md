# Travel Reservation System

A Next.js-based reservation system for hotels, flights, and tours. This system provides a modern travel booking platform with a clean, responsive interface.

## Features

- **Hotels**: Browse and reserve hotel accommodations
- **Flights**: Book flight tickets with departure/arrival information
- **Tours**: Discover and book guided tours to various destinations
- **Real-time Updates**: Optimistic UI updates with SWR for smooth user experience
- **Responsive Design**: Modern UI built with Tailwind CSS using custom color palette
- **Extensible**: Clean architecture for easy feature additions

## Tech Stack

- **Frontend**: Next.js 15.5.4 with App Router
- **Styling**: Tailwind CSS with custom color palette
- **Data Fetching**: SWR for client-side data management
- **Backend**: JSON Server (fake REST API)
- **HTTP Client**: Axios for API communication
- **Language**: TypeScript

## Color Palette

- Primary Orange: `#EF7722`
- Secondary Orange: `#FAA533`
- Light Gray: `#EBEBEB`
- Primary Blue: `#0BA6DF`

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd a2a-test
```

2. Install dependencies:
```bash
npm install
```

### Running the Application

#### Option 1: Run Both Services Concurrently (Recommended)
```bash
npm run start:all
```

This will start:
- Next.js development server on port 3000
- JSON Server on port 3001

#### Option 2: Run Services Separately

Terminal 1 - Start JSON Server:
```bash
npm run json-server
```

Terminal 2 - Start Next.js:
```bash
npm run dev
```

### Access the Application

- **Frontend**: http://localhost:3000
- **JSON Server API**: http://localhost:3001

## API Endpoints

The JSON Server provides the following endpoints:

### Hotels
- `GET /hotels` - Get all hotels
- `GET /hotels/:id` - Get specific hotel
- `PATCH /hotels/:id` - Update hotel (used for reservation toggle)

### Flights
- `GET /flights` - Get all flights
- `GET /flights/:id` - Get specific flight
- `PATCH /flights/:id` - Update flight (used for reservation toggle)

### Tours
- `GET /tours` - Get all tours
- `GET /tours/:id` - Get specific tour
- `PATCH /tours/:id` - Update tour (used for reservation toggle)

## Project Structure

```
src/
├── app/
│   ├── hotels/
│   │   └── page.tsx          # Hotels listing page
│   ├── flights/
│   │   └── page.tsx          # Flights listing page
│   ├── tours/
│   │   └── page.tsx          # Tours listing page
│   ├── layout.tsx            # Root layout with navigation
│   ├── page.tsx              # Home page
│   └── globals.css           # Global styles with color palette
├── components/
│   ├── Navigation.tsx        # Navigation component
│   └── ReservationCard.tsx   # Reusable reservation card
└── lib/
    └── api.ts                # API service functions
db/
└── db.json                   # JSON Server database
```

## Architecture

The system follows a clean, modular architecture:

### Service Pages
- **Hotels**: `src/app/hotels/page.tsx` - Hotel reservation management
- **Flights**: `src/app/flights/page.tsx` - Flight booking interface
- **Tours**: `src/app/tours/page.tsx` - Tour booking system

### Components
- **Navigation**: `src/components/Navigation.tsx` - Top navigation bar
- **ReservationCard**: `src/components/ReservationCard.tsx` - Reusable booking card

### API Layer
- **API Service**: `src/lib/api.ts` - Centralized API communication functions

## Development

### Available Scripts

- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run json-server` - Start JSON Server
- `npm run start:all` - Start both services concurrently

### Adding New Services

To add a new service (e.g., car rentals):

1. Add data to `db/db.json`
2. Create API functions in `src/lib/api.ts`
3. Create page component in `src/app/[service]/page.tsx`
4. Add navigation link in `src/components/Navigation.tsx`

### Customization

The system is built with extensibility in mind:
- Clean separation of concerns
- Reusable components
- Centralized API management
- Easy to add new features and services

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
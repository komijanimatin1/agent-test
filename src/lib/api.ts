import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001';

// Types for our data models
export interface Hotel {
  id: string;
  name: string;
  location: string;
  price_per_night: number;
  stars: number;
  has_pool: boolean;
  has_wifi: boolean;
  has_gym: boolean;
  room_type: string;
  check_in: string;
  check_out: string;
  reserved: boolean;
  available_rooms: number;
}

export interface Flight {
  id: string;
  continent: string;
  from: string;
  from_airport: string;
  to: string;
  to_airport: string;
  airline: string;
  flight_number: string;
  date: string;
  departure_time: string;
  arrival_time: string;
  duration: string;
  price: {
    economy: number;
    business: number;
  };
  baggage: {
    carry_on: string;
    checked: string;
  };
  seats_remaining: number;
  reserved: boolean;
}

export interface Tour {
  id: number;
  destination: string;
  duration: string;
  price: number;
  reserved: boolean;
}

// Hotel API functions
export const hotelApi = {
  getAll: async (): Promise<Hotel[]> => {
    const response = await axios.get(`${API_BASE_URL}/hotels`);
    return response.data;
  },
  
  toggleReservation: async (id: string): Promise<Hotel> => {
    // First get the current hotel data
    const currentResponse = await axios.get(`${API_BASE_URL}/hotels/${id}`);
    const currentHotel = currentResponse.data;
    
    // Toggle the reserved status
    const updatedHotel = { ...currentHotel, reserved: !currentHotel.reserved };
    
    // Update the hotel
    const response = await axios.patch(`${API_BASE_URL}/hotels/${id}`, updatedHotel);
    return response.data;
  }
};

// Flight API functions
export const flightApi = {
  getAll: async (): Promise<Flight[]> => {
    const response = await axios.get(`${API_BASE_URL}/flights`);
    return response.data;
  },
  
  toggleReservation: async (id: string): Promise<Flight> => {
    // First get the current flight data
    const currentResponse = await axios.get(`${API_BASE_URL}/flights/${id}`);
    const currentFlight = currentResponse.data;
    
    // Toggle the reserved status
    const updatedFlight = { ...currentFlight, reserved: !currentFlight.reserved };
    
    // Update the flight
    const response = await axios.patch(`${API_BASE_URL}/flights/${id}`, updatedFlight);
    return response.data;
  }
};

// Tour API functions
export const tourApi = {
  getAll: async (): Promise<Tour[]> => {
    const response = await axios.get(`${API_BASE_URL}/tours`);
    return response.data;
  },
  
  toggleReservation: async (id: number): Promise<Tour> => {
    // First get the current tour data
    const currentResponse = await axios.get(`${API_BASE_URL}/tours/${id}`);
    const currentTour = currentResponse.data;
    
    // Toggle the reserved status
    const updatedTour = { ...currentTour, reserved: !currentTour.reserved };
    
    // Update the tour
    const response = await axios.patch(`${API_BASE_URL}/tours/${id}`, updatedTour);
    return response.data;
  }
};

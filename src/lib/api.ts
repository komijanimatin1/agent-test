import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001';

// Types for our data models
export interface Hotel {
  id: number;
  name: string;
  location: string;
  price: number;
  reserved: boolean;
}

export interface Flight {
  id: number;
  from: string;
  to: string;
  date: string;
  price: number;
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
  
  toggleReservation: async (id: number): Promise<Hotel> => {
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
  
  toggleReservation: async (id: number): Promise<Flight> => {
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

// Get sport icon
  const getSportIcon = (sport: SportType) => {
    switch (sport) {
      case 'rower':
        return <RowingBoat className="w-5 h-5" />;
      case 'bike':  // Changed from 'bikeerg'
        return <Bike className="w-5 h-5" />;
      case 'skierg':
        return <Mountain className="w-5 h-5" />;
      default:
        return <RowingBoat className="w-5 h-5" />;
    }
  };